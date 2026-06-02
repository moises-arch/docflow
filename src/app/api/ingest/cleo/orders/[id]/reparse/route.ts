// Re-parse a Cleo order from its stored HTML without launching Playwright.
// Useful when the parser was updated (e.g. buying_party fix) and existing
// downloaded orders need their draft refreshed without a full re-download.
//
// Flow:
//   1. Fetch html_storage_path from cleo_orders
//   2. Download HTML from Supabase Storage
//   3. Re-parse with current parseCleoHtml (v1.0.2+)
//   4. Update parsed_payload in cleo_orders
//   5. Detect provider via 2-stage lookup (trading_partner → buying_party keyword)
//   6. Update document.provider_id
//   7. Re-run applyParsedToDraft to refresh the order_draft

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { parseCleoHtml } from "@/lib/cleo/parse-html";
import { applyParsedToDraft } from "@/lib/cleo/apply-parsed";
import { runCleoJob } from "@/lib/cleo/runner";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // Aumentado: fallback usa Playwright

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const svc = createServiceClient();

  // 1. Fetch cleo_orders row
  const { data: orderData } = await svc
    .from("cleo_orders")
    .select("id, cleo_message_id, trading_partner, html_storage_path, document_id, state")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const order = orderData as {
    id: string;
    cleo_message_id: string;
    trading_partner: string | null;
    html_storage_path: string | null;
    document_id: string | null;
    state: string;
  } | null;

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!order.html_storage_path) {
    return NextResponse.json(
      { error: "No HTML stored for this order — use Reintentar to re-download from Cleo" },
      { status: 422 },
    );
  }
  if (!order.document_id) {
    return NextResponse.json({ error: "No document associated with this order" }, { status: 422 });
  }

  // 2. Download HTML from Storage — si no existe, fallback a Playwright
  const { data: fileData, error: dlErr } = await svc.storage
    .from("documents")
    .download(order.html_storage_path);

  if (dlErr || !fileData) {
    // HTML no existe en Storage (upload falló silenciosamente).
    // Limpiar el path inválido y hacer retry completo con Playwright.
    await svc
      .from("cleo_orders")
      .update({ html_storage_path: null, state: "pending", last_error: null })
      .eq("id", id);

    const result = await runCleoJob({
      tenant_id: tenantId,
      inbound_email_id: null,
      cleo_message_id: order.cleo_message_id,
      cleo_reference: "",
      cleo_batch_id: "",
      trading_partner: order.trading_partner,
      subject: null,
      from_email: "reparse@docflow",
    });

    return NextResponse.json({
      ok: result.ok,
      fallback: "playwright",
      ...(result.ok
        ? { document_id: result.document_id }
        : { error: "reason" in result ? result.reason : "unknown" }),
    }, { status: result.ok ? 200 : 500 });
  }

  const html = await fileData.text();
  if (!html || html.length < 100) {
    return NextResponse.json({ error: "HTML file empty or too small" }, { status: 422 });
  }

  // 3. Re-parse with current parser
  const parsed = parseCleoHtml(html);

  // 4. Update parsed_payload in cleo_orders
  await svc
    .from("cleo_orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ parsed_payload: parsed as any })
    .eq("id", id);

  // 5. Detect provider — 2-stage lookup (same logic as runner.ts)
  type ProvRow = { id: string };
  const tryMatch = async (pattern: string): Promise<string | null> => {
    const { data } = await (
      svc.from("providers") as unknown as {
        select: (c: string) => {
          ilike: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              limit: (n: number) => Promise<{ data: ProvRow[] | null }>;
            };
          };
        };
      }
    )
      .select("id")
      .ilike("name", pattern)
      .eq("tenant_id", tenantId)
      .limit(1);
    return data?.[0]?.id ?? null;
  };

  let providerId: string | null = null;

  // Stage 1: exact trading_partner match
  if (order.trading_partner) {
    providerId = await tryMatch(order.trading_partner);
  }

  // Stage 2: keyword match from buying_party
  if (!providerId && parsed.buying_party.company_name) {
    const STOP = new Set(["accounts", "payable", "corp", "corporation", "inc", "llc", "ltd", "the", "and"]);
    const keywords = parsed.buying_party.company_name
      .toLowerCase()
      .split(/[\s,.\-+&]+/)
      .filter((w) => w.length > 3 && !STOP.has(w) && /^[a-z]/.test(w));
    for (const kw of keywords) {
      const found = await tryMatch(`%${kw}%`);
      if (found) { providerId = found; break; }
    }
  }

  // 6. Update document.provider_id if detected
  if (providerId) {
    await svc.from("documents").update({ provider_id: providerId }).eq("id", order.document_id);
  }

  // 7. Re-apply to draft
  const result = await applyParsedToDraft(order.document_id, tenantId, providerId, parsed);

  return NextResponse.json({
    ok: true,
    provider_found: !!providerId,
    buying_party_name: parsed.buying_party.company_name,
    draft_id: result.draft_id,
    lines_inserted: result.lines_inserted,
  });
}
