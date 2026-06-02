// Walmart order process job handler. Called by:
// - The webhook receiver (PO_CREATED)
// - The scan-pending cron (rescue path)
// - Manual retry from the dashboard
//
// State machine: pending → running → downloaded | failed | manual_required
// Idempotent: re-running a `downloaded` order returns early.

import { createServiceClient } from "@/lib/supabase/service";
import { getOrder, acknowledgeOrder } from "@/lib/walmart/api/orders";
import { parseWalmartOrder } from "@/lib/walmart/parse-order";
import { renderWalmartOrderToPdf } from "@/lib/walmart/render-pdf";
import { applyWalmartToDraft } from "@/lib/walmart/apply-parsed";
import { getWalmartSettings } from "@/lib/walmart/settings";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT_BUCKET = "documents";
const MAX_ATTEMPTS = 5;

function authorized(req: NextRequest): boolean {
  const expected = process.env.INTAKE_WALMART_INTERNAL_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get("x-walmart-internal-token");
  return Boolean(provided && provided === expected);
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("walmart process unhandled:", detail);
    return NextResponse.json({ error: "unhandled", detail: detail.slice(0, 500) }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { tenant_id?: string; walmart_po_id?: string; correlation_id?: string; dry_run?: boolean }
    | null;

  if (body?.dry_run) {
    return NextResponse.json({
      dry_run: true,
      ok: Boolean(
        process.env.WALMART_CLIENT_ID &&
          process.env.WALMART_CLIENT_SECRET &&
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      env: {
        walmart_client_id: Boolean(process.env.WALMART_CLIENT_ID),
        walmart_client_secret: Boolean(process.env.WALMART_CLIENT_SECRET),
        supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        supabase_service_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
    });
  }

  if (!body?.tenant_id || !UUID_RE.test(body.tenant_id)) {
    return NextResponse.json({ error: "invalid_tenant_id" }, { status: 422 });
  }
  if (!body.walmart_po_id) {
    return NextResponse.json({ error: "missing_walmart_po_id" }, { status: 422 });
  }
  const tenantId = body.tenant_id;
  const walmartPoId = body.walmart_po_id;
  const correlationId = body.correlation_id ?? randomUUID();

  const svc = createServiceClient();

  // 1. Load existing row (created by webhook or upsert on the fly)
  const { data: existing } = await svc
    .from("walmart_orders")
    .select("id, state, document_id, attempts")
    .eq("tenant_id", tenantId)
    .eq("walmart_po_id", walmartPoId)
    .limit(1)
    .returns<Array<{ id: string; state: string; document_id: string | null; attempts: number }>>();

  let row = existing?.[0] ?? null;

  // If not exists yet (e.g. rescued by cron), upsert
  if (!row) {
    const upsertResult = await (
      svc.from("walmart_orders") as unknown as {
        upsert: (
          v: Record<string, unknown>,
          opts: { onConflict: string },
        ) => {
          select: (
            cols: string,
          ) => {
            single: () => Promise<{
              data: {
                id: string;
                state: string;
                document_id: string | null;
                attempts: number;
              } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      }
    )
      .upsert(
        {
          tenant_id: tenantId,
          walmart_po_id: walmartPoId,
          state: "pending",
          source: "manual",
          meta: { correlation_id: correlationId },
        },
        { onConflict: "tenant_id,walmart_po_id" },
      )
      .select("id, state, document_id, attempts")
      .single();
    row = upsertResult.data;
    if (!row) {
      return NextResponse.json(
        { error: upsertResult.error?.message ?? "upsert_failed" },
        { status: 500 },
      );
    }
  }

  // Idempotent: ya descargado o en proceso activo (evita crear documentos duplicados
  // si dos llamadas concurrentes llegan antes de que la primera marque state=downloaded).
  if (row.state === "downloaded" && row.document_id) {
    return NextResponse.json({ ok: true, reason: "already_downloaded", document_id: row.document_id });
  }
  if (row.state === "running") {
    return NextResponse.json({ ok: true, reason: "already_running", walmart_order_id: row.id });
  }

  // Too many attempts → permanent failure
  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { ok: false, reason: "max_attempts_exceeded", attempts: row.attempts },
      { status: 500 },
    );
  }

  // 2. Mark running
  await (
    svc.from("walmart_orders") as unknown as {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    }
  )
    .update({ state: "running", attempts: row.attempts + 1, last_error: null })
    .eq("id", row.id);

  try {
    // 3. Fetch order from Walmart
    const order = await getOrder(walmartPoId, correlationId);
    const parsed = parseWalmartOrder(order);

    // 4. Render PDF (best-effort)
    const pdf = await renderWalmartOrderToPdf(parsed);

    // 5. Upload PDF + raw JSON to Storage
    const documentId = randomUUID();
    const ts = new Date().toISOString().slice(0, 7);
    const storagePath = `${tenantId}/walmart/${ts}/${documentId}.pdf`;
    const jsonStoragePath = `${tenantId}/walmart/${ts}/${documentId}.json`;

    if (pdf) {
      const upload = await svc.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
      if (upload.error) {
        // Non-fatal — log and continue without storage path
        console.warn("walmart_pdf_upload_failed:", upload.error.message);
      }
    }

    // Always store the raw JSON for audit
    await svc.storage
      .from(DOCUMENT_BUCKET)
      .upload(jsonStoragePath, JSON.stringify(order, null, 2), {
        contentType: "application/json",
        upsert: false,
      })
      .catch((err) => console.warn("walmart_json_upload_warning:", err));

    // 6. Resolve provider (Walmart Marketplace) by name
    let providerId: string | null = null;
    const { data: providerMatch } = await svc
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", "%walmart%marketplace%")
      .limit(1)
      .returns<Array<{ id: string }>>();
    if (providerMatch?.[0]) providerId = providerMatch[0].id;

    // 7. Create documents row
    const checksum = pdf
      ? createHash("sha256").update(pdf).digest("hex")
      : createHash("sha256").update(JSON.stringify(order)).digest("hex");
    const originalName = `walmart_marketplace-${parsed.po_number}.pdf`;
    const documentInsert = {
      id: documentId,
      tenant_id: tenantId,
      provider_id: providerId,
      original_name: originalName,
      storage_path: pdf ? storagePath : jsonStoragePath,
      mime_type: pdf ? "application/pdf" : "application/json",
      size_bytes: pdf ? pdf.length : 0,
      state: "uploaded",
      source_channel: "api",
      source_ref: row.id,
      source_meta: {
        source: "walmart_api",
        walmart_po_id: walmartPoId,
        customer_order_id: parsed.customer_order_id,
        correlation_id: correlationId,
        checksum,
        json_storage_path: jsonStoragePath,
        provider_match_method: providerId ? "name_match" : null,
      },
    };
    const docInsertResult = await (
      svc.from("documents") as unknown as {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      }
    )
      .insert(documentInsert)
      .select("id")
      .single();
    if (docInsertResult.error || !docInsertResult.data) {
      throw new Error(`walmart_document_insert_failed:${docInsertResult.error?.message}`);
    }

    // 8. Apply parsed data directly to draft (no AI wait)
    await applyWalmartToDraft(documentId, tenantId, providerId, parsed);

    // 9. Read tenant settings
    const settings = await getWalmartSettings(tenantId);

    // 10. Optional: acknowledge to Walmart (default ON)
    if (settings.auto_acknowledge) {
      try {
        await acknowledgeOrder(walmartPoId, correlationId);
        await (
          svc.from("walmart_orders") as unknown as {
            update: (v: Record<string, unknown>) => {
              eq: (c: string, v: string) => Promise<{ error: unknown }>;
            };
          }
        )
          .update({ acknowledged_at: new Date().toISOString() })
          .eq("id", row.id);
      } catch (err) {
        console.warn("walmart_acknowledge_warning:", err);
      }
    }

    // 11. AI fallback toggle
    if (settings.ai_fallback_enabled) {
      // Trigger AI pipeline — it will set document state to needs_review when done
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ document_id: documentId, tenant_id: tenantId }),
      }).catch(() => {});
    } else {
      // No AI — data comes 100% from Walmart API JSON.
      // Advance document to needs_review so it shows up in the inbox
      // ready for human review and Odoo sync approval.
      await (
        svc.from("documents") as unknown as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({ state: "needs_review" })
        .eq("id", documentId);
    }

    // 12. Mark downloaded
    await (
      svc.from("walmart_orders") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update({
        state: "downloaded",
        document_id: documentId,
        parsed_payload: parsed,
        raw_response: order as unknown as Record<string, unknown>,
      })
      .eq("id", row.id);

    return NextResponse.json({
      ok: true,
      document_id: documentId,
      walmart_order_id: row.id,
      lines: parsed.lines.length,
      grand_total: parsed.totals.grand_total,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await (
      svc.from("walmart_orders") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update({ state: "failed", last_error: reason })
      .eq("id", row.id);
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
}
