export const maxDuration = 60;
import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeCountry } from "@/lib/odoo/country";
import { NextRequest, NextResponse } from "next/server";
import { sendOrderApprovedEmail } from "@/lib/email/order-notifications";

type RequiredTargetField = {
  id: string;
  key: string;
  label: string;
  scope: string;
  required: boolean;
};

type DraftForApproval = {
  id: string;
  document_id: string;
  review_profile_id: string | null;
  provider_id: string | null;
  po_number: string | null;
  po_date: string | null;
  currency: string | null;
  buyer: Json;
  shipping_address: Json;
  billing_address: Json;
  payment_terms: string | null;
  notes: string | null;
};

type DocumentForApproval = {
  id: string;
  provider_id: string | null;
  original_name: string | null;
  source_channel: string | null;
  source_meta: Record<string, unknown> | null;
};

type LineForApproval = {
  sku: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  odoo_product_id: number | null;
};

function jsonText(value: Json, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) && key in value
    ? String((value as Record<string, unknown>)[key] ?? "")
    : "";
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cleanText(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeBlock(value: string | null | undefined, max = 2000) {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function addressText(value: Json, max = 1600) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const read = (keys: string[]) => {
    for (const key of keys) {
      const raw = record[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
    return "";
  };

  const name = read(["name", "recipient"]);
  const line1 = read(["line1", "street", "address"]);
  const line2 = read(["line2"]);
  const city = read(["city", "town"]);
  const state = read(["state", "province"]);
  const zip = read(["zip", "postal_code", "postcode"]);
  const country = read(["country", "country_name"]);
  const stateZip = [state, zip].filter(Boolean).join(" ");

  return normalizeBlock(
    [name, line1, line2, city, stateZip, country].filter(Boolean).join(", "),
    max,
  );
}

function providerLearnedDefaults(draft: DraftForApproval) {
  // Only include fields that have actual content. Empty/null fields must NEVER
  // be written to learned_defaults — they would overwrite previously-learned
  // good values and corrupt extraction for every future order from this provider.
  // updated_at is always set so we know when the last learning happened.
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const currency = normalizeBlock(draft.currency?.toUpperCase() ?? null, 3);
  if (currency) fields.currency = currency;

  const delivery = addressText(draft.shipping_address);
  if (delivery) fields.delivery_address = delivery;

  const billing =
    addressText(draft.billing_address) ?? normalizeBlock(jsonText(draft.buyer, "address"), 1600);
  if (billing) fields.billing_address = billing;

  const terms = normalizeBlock(draft.payment_terms, 500);
  if (terms) fields.payment_terms = terms;

  const notes = normalizeBlock(draft.notes, 4000);
  if (notes) fields.notes = notes;

  return fields;
}

function lineHasValue(line: LineForApproval, key: string) {
  switch (key) {
    case "product_id":
      return Number.isFinite(line.odoo_product_id ?? NaN);
    case "product_uom_qty":
      return Number(line.quantity ?? 0) > 0;
    case "price_unit":
      return line.unit_price !== null && Number.isFinite(Number(line.unit_price));
    case "name":
      return hasText(line.description);
    case "tax_id":
      return line.tax_rate !== null;
    default:
      return true;
  }
}

function normalizeJsonAddress(value: Json): { value: Json; changed: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, changed: false };
  }
  const obj = value as Record<string, unknown>;
  const original = typeof obj.country === "string" ? obj.country : null;
  if (!original) return { value, changed: false };
  const canonical = normalizeCountry(original);
  if (canonical === original) return { value, changed: false };
  return { value: { ...obj, country: canonical } as Json, changed: true };
}

async function normalizeAddressCountries(
  shipping: Json,
  billing: Json,
  buyer: Json,
): Promise<{ shipping: Json; billing: Json; buyer: Json; changed: boolean }> {
  const s = normalizeJsonAddress(shipping);
  const b = normalizeJsonAddress(billing);
  const u = normalizeJsonAddress(buyer);
  return {
    shipping: s.value,
    billing: b.value,
    buyer: u.value,
    changed: s.changed || b.changed || u.changed,
  };
}

function findMissingRequiredFields(
  draft: DraftForApproval,
  lines: LineForApproval[],
  targetFields: RequiredTargetField[],
) {
  const missing: RequiredTargetField[] = [];
  const customer = jsonText(draft.buyer, "name");
  const customerAddress = jsonText(draft.shipping_address, "line1");

  for (const field of targetFields) {
    if (!field.required) continue;

    if (field.scope === "line") {
      if (!lines.length || lines.some((line) => !lineHasValue(line, field.key))) {
        missing.push(field);
      }
      continue;
    }

    const present =
      field.key === "partner_id"
        ? hasText(customer)
        : field.key === "customer_address"
          ? hasText(customerAddress)
          : field.key === "client_order_ref"
            ? hasText(draft.po_number)
            : field.key === "date_order"
              ? hasText(draft.po_date)
              : field.key === "currency_id"
                ? hasText(draft.currency)
                : field.key === "note"
                  ? hasText(draft.notes)
                  : true;

    if (!present) {
      missing.push(field);
    }
  }

  return missing;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // El body es opcional. Hoy aceptamos:
  //   skip_odoo_sync?: boolean — respeta auto-sync OFF (no se usa server-side todavía)
  //   force_duplicate_po?: boolean — saltea el guard de PO duplicado (intencional, con UI confirmando)
  let forceDuplicatePo = false;
  try {
    const body = (await req.json().catch(() => null)) as
      | { force_duplicate_po?: unknown }
      | null;
    if (body && body.force_duplicate_po === true) forceDuplicatePo = true;
  } catch {
    /* body opcional */
  }
  const supabase = await createClient();
  const db = supabase as unknown as DynamicSupabaseClient;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;

  const { data: draft } = await supabase
    .from("order_drafts")
    .select(
      "id, document_id, review_profile_id, provider_id, po_number, po_date, currency, buyer, shipping_address, billing_address, payment_terms, notes",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single<DraftForApproval>();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, provider_id, original_name, source_channel, source_meta")
    .eq("id", draft.document_id)
    .eq("tenant_id", tenantId)
    .single<DocumentForApproval>();

  let providerId = draft.provider_id ?? document?.provider_id ?? null;

  // ── Global rule: buyer_unresolved blocks approval ─────────────────────────
  // When apply-parsed can't determine the Odoo customer (no default_reseller
  // on the provider), it stores buyer = { unresolved: true, original_name }.
  // The user must assign a customer manually in the review UI before approving.
  if (
    draft.buyer &&
    typeof draft.buyer === "object" &&
    !Array.isArray(draft.buyer) &&
    (draft.buyer as Record<string, unknown>).unresolved === true
  ) {
    return NextResponse.json(
      {
        error: "buyer_unresolved",
        detail:
          "El cliente (buyer) no pudo resolverse automáticamente. Asígna el cliente de Odoo manualmente en la pestaña 'Header' antes de aprobar.",
        original_name: (draft.buyer as Record<string, unknown>).original_name ?? null,
      },
      { status: 422 },
    );
  }

  if (!providerId && document) {
    // For Cleo docs the provider is always pre-set by the runner. If it
    // somehow isn't, block rather than creating a junk provider. The user
    // should navigate to the document and assign the provider manually.
    const isCleo =
      document.source_channel === "browser" &&
      (document.source_meta as Record<string, unknown> | null)?.source === "cleo";
    if (isCleo) {
      return NextResponse.json(
        {
          error: "provider_unresolved",
          detail:
            "Orden Cleo sin proveedor asignado. Abre el documento y asigna la plantilla de proveedor antes de aprobar.",
        },
        { status: 422 },
      );
    }
    const fallbackName =
      cleanText(document.original_name, 120) || cleanText(draft.po_number, 120) || "Provider";
    const fallbackCode = slugify(fallbackName) || `provider-${crypto.randomUUID().slice(0, 8)}`;
    const service = createServiceClient();
    const serviceDb = service as unknown as DynamicSupabaseClient;

    const { data: existingProviderRow } = await serviceDb
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", fallbackCode)
      .maybeSingle();

    const existingProvider = (existingProviderRow ?? null) as { id: string } | null;

    providerId = existingProvider?.id ?? null;

    if (!providerId) {
      const { data: createdProviderRow } = await serviceDb
        .from("providers")
        .insert({
          tenant_id: tenantId,
          name: fallbackName,
          code: fallbackCode,
          status: "active",
          email_domains: [],
        })
        .select("id")
        .single();

      const createdProvider = (createdProviderRow ?? null) as { id: string } | null;

      providerId = createdProvider?.id ?? null;
    }

    if (providerId) {
      // Conditional UPDATE: only set provider_id if currently NULL.
      // Two concurrent approve calls would otherwise race; the loser is harmless.
      await Promise.all([
        serviceDb
          .from("documents")
          .update({ provider_id: providerId })
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .is("provider_id", null),
        serviceDb
          .from("order_drafts")
          .update({ provider_id: providerId })
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .is("provider_id", null),
      ]);
    }
  }

  if (!draft.review_profile_id || !providerId) {
    return NextResponse.json(
      {
        error: "provider_unresolved",
        detail: "Document template/provider must be resolved before approval",
      },
      { status: 422 },
    );
  }

  const { data: providerResellerMapping } = await db
    .from<{ id: string }>("provider_reseller_mappings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!providerResellerMapping?.id) {
    return NextResponse.json(
      {
        error: "provider_unresolved",
        detail: "Provider must be mapped to an Odoo reseller before approval",
      },
      { status: 422 },
    );
  }

  const { data: lines, error: linesError } = await supabase
    .from("order_draft_lines")
    .select("sku, description, quantity, unit_price, tax_rate, odoo_product_id")
    .eq("order_draft_id", id)
    .eq("tenant_id", tenantId)
    .returns<LineForApproval[]>();

  if (linesError) {
    return NextResponse.json({ error: "Failed to validate lines" }, { status: 500 });
  }

  if (!lines?.length) {
    return NextResponse.json({ error: "Order draft has no lines" }, { status: 422 });
  }

  let targetFieldsQuery = db
    .from<RequiredTargetField[]>("target_fields")
    .select("id, key, label, scope, required")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .eq("required", true);

  if (draft.review_profile_id) {
    targetFieldsQuery = targetFieldsQuery.eq("review_profile_id", draft.review_profile_id);
  }

  const { data: targetFields, error: targetFieldsError } = await targetFieldsQuery;

  if (targetFieldsError) {
    return NextResponse.json({ error: "Failed to validate required fields" }, { status: 500 });
  }

  const missingRequiredFields = findMissingRequiredFields(draft, lines, targetFields ?? []);

  if (missingRequiredFields.length > 0) {
    return NextResponse.json(
      {
        error: "missing_required_fields",
        fields: missingRequiredFields.map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          scope: field.scope,
        })),
      },
      { status: 422 },
    );
  }

  // ── Global rule: reject duplicate PO numbers ────────────────────────────
  // If another draft in this tenant already has the same po_number AND has
  // been synced (or is currently syncing), block the approval. This prevents
  // double-pushing the same PO to Odoo by accident.
  // El operador puede forzar el push (force_duplicate_po=true) — la UI confirma
  // explícitamente antes de mandar el flag.
  if (draft.po_number && !forceDuplicatePo) {
    type DupeRow = { id: string; sync_state: string; odoo_so_name: string | null };
    const { data: dupesRaw } = await supabase
      .from("order_drafts")
      .select("id, sync_state, odoo_so_name")
      .eq("tenant_id", tenantId)
      .eq("po_number", draft.po_number)
      .in("sync_state", ["pending", "in_progress", "synced"])
      .returns<DupeRow[]>();
    const dupes = (dupesRaw ?? []).filter((row) => row.id !== id);
    if (dupes.length > 0) {
      const existing = dupes[0];
      return NextResponse.json(
        {
          error: "duplicate_po_number",
          detail: `PO ${draft.po_number} already exists${
            existing.odoo_so_name ? ` (Odoo: ${existing.odoo_so_name})` : ""
          }. Sync state: ${existing.sync_state}.`,
          existing_draft_id: existing.id,
          existing_sync_state: existing.sync_state,
          existing_odoo_so_name: existing.odoo_so_name,
        },
        { status: 409 },
      );
    }
  }

  // ── Global rule: normalize country to Odoo canonical name ───────────────
  // Odoo expects "United States" not "US". Normalize before sync so partner
  // resolution works. Apply to shipping_address, billing_address and buyer.
  const earlyService = createServiceClient();
  const normalized = await normalizeAddressCountries(
    draft.shipping_address,
    draft.billing_address,
    draft.buyer,
  );
  if (normalized.changed) {
    await (
      earlyService.from("order_drafts") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      }
    )
      .update({
        shipping_address: normalized.shipping,
        billing_address: normalized.billing,
        buyer: normalized.buyer,
      })
      .eq("id", id);
    draft.shipping_address = normalized.shipping;
    draft.billing_address = normalized.billing;
    draft.buyer = normalized.buyer;
  }

  const service = createServiceClient();
  const serviceUntyped = service as unknown as DynamicSupabaseClient;
  const approvedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const learnedDefaults = providerLearnedDefaults(draft);
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { data: odooConnection } = await service
    .from("odoo_connections")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!odooConnection || odooConnection.status !== "active") {
    return NextResponse.json(
      {
        error: "odoo_connection_inactive",
        detail: "Configure and verify an active Odoo connection before approval",
      },
      { status: 422 },
    );
  }

  const { data: providerRecordRow } = await serviceUntyped
    .from("providers")
    .select("default_currency, settings")
    .eq("tenant_id", tenantId)
    .eq("id", providerId)
    .maybeSingle();

  const providerRecord = (providerRecordRow ?? null) as {
    default_currency: string | null;
    settings: Json | null;
  } | null;

  const providerSettings =
    providerRecord?.settings &&
    typeof providerRecord.settings === "object" &&
    !Array.isArray(providerRecord.settings)
      ? (providerRecord.settings as Record<string, unknown>)
      : {};
  const existingLearned =
    providerSettings.learned_defaults &&
    typeof providerSettings.learned_defaults === "object" &&
    !Array.isArray(providerSettings.learned_defaults)
      ? (providerSettings.learned_defaults as Record<string, unknown>)
      : {};

  await serviceUntyped
    .from("providers")
    .update({
      default_currency: learnedDefaults.currency ?? providerRecord?.default_currency ?? null,
      settings: {
        ...providerSettings,
        learned_defaults: {
          ...existingLearned,
          ...learnedDefaults,
        },
      },
    })
    .eq("tenant_id", tenantId)
    .eq("id", providerId);

  // Race-condition guard: this UPDATE will only match rows that are NOT
  // already in an active sync state. If two approve requests fire simultaneously,
  // only one will affect a row; the other gets `count: 0` and returns 409.
  // This complements the cross-draft duplicate check above (which only catches
  // duplicates across distinct drafts) by closing the same-draft double-click race.
  const draftUpdateResp = await service
    .from("order_drafts")
    .update({
      sync_state: "pending",
      approved_by: user.id,
      approved_at: approvedAt,
      last_sync_error: null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .not("sync_state", "in", "(pending,in_progress,synced)")
    .select("id");

  if (draftUpdateResp.error) {
    return NextResponse.json({ error: "Failed to approve draft" }, { status: 500 });
  }

  // Zero rows matched → another approval request already took this draft past
  // the guard. Return 409 so the second click sees an explicit "already approved".
  if (!draftUpdateResp.data || draftUpdateResp.data.length === 0) {
    return NextResponse.json(
      {
        error: "already_approved",
        detail: "This draft has already been approved by another request.",
      },
      { status: 409 },
    );
  }

  const { error: documentUpdateError } = await service
    .from("documents")
    .update({ state: "reviewed", last_error: null })
    .eq("id", draft.document_id)
    .eq("tenant_id", tenantId);

  if (documentUpdateError) {
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    const errorMessage = "Missing Supabase runtime env for odoo-sync trigger";
    await service
      .from("order_drafts")
      .update({ sync_state: "sync_failed", last_sync_error: errorMessage })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    await serviceUntyped.from("odoo_sync_attempts").insert({
      tenant_id: tenantId,
      order_draft_id: id,
      run_id: runId,
      outcome: "error",
      odoo_so_id: null,
      odoo_so_name: null,
      error_message: errorMessage,
    });
    return NextResponse.json({ sync_state: "sync_failed", sync_run_started: false });
  }

  // Await the trigger with a generous timeout. If Odoo is slow and the edge
  // function doesn't respond in time we still return "pending" — the edge
  // function keeps running on Supabase infrastructure and will update the
  // draft state itself (synced / sync_failed). We never set sync_failed here.
  const fnUrl = `${supabaseUrl}/functions/v1/odoo-sync`;
  try {
    const response = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ order_draft_id: id, tenant_id: tenantId, run_id: runId }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const body = await response.text();
      const errorMessage = `odoo-sync trigger responded ${response.status}: ${body}`.slice(0, 1000);

      // Mark the draft sync as failed so the user can retry from Processed.
      // Do NOT revert document state to failed_processing — the document is
      // approved and belongs in Processed, not back in the Inbox.
      await service
        .from("order_drafts")
        .update({ sync_state: "sync_failed", last_sync_error: errorMessage })
        .eq("id", id)
        .eq("tenant_id", tenantId);

      await serviceUntyped.from("odoo_sync_attempts").insert({
        tenant_id: tenantId,
        order_draft_id: id,
        run_id: runId,
        outcome: "error",
        odoo_so_id: null,
        odoo_so_name: null,
        error_message: errorMessage,
      });

      return NextResponse.json(
        { error: "odoo_sync_failed", detail: errorMessage, sync_run_started: false },
        { status: 502 },
      );
    }

    // Parse the SO data returned by the edge function on success.
    const syncResult = await response.json().catch(() => null) as {
      ok?: boolean;
      odoo_so_id?: number | null;
      odoo_so_name?: string | null;
    } | null;
    const odooSoId = syncResult?.odoo_so_id ?? null;
    const odooSoName = syncResult?.odoo_so_name ?? null;

    // Email de confirmación — best-effort, no bloquea la response.
    if (odooSoId && odooSoName) {
      void sendOrderApprovedEmail({
        tenantId,
        draftId: id,
        odooSoId: typeof odooSoId === "number" ? odooSoId : Number(odooSoId),
        odooSoName: String(odooSoName),
      }).catch((err: unknown) =>
        console.error("[approve] email failed:", err instanceof Error ? err.message : String(err)),
      );
    }
  } catch (e: unknown) {
    // Timeout or network error — odoo-sync edge function is still running and
    // will update the draft state itself. Return pending so the UI can poll.
    const networkMsg = e instanceof Error ? e.message : String(e);
    console.error("[approve] odoo-sync trigger error:", networkMsg);
  }

  return NextResponse.json({ sync_state: "pending", sync_run_started: true });
}
