import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type DraftPayload = {
  po_number?: unknown;
  po_date?: unknown;
  delivery_date?: unknown;
  currency?: unknown;
  payment_terms?: unknown;
  customer_name?: unknown;
  customer_contact_person?: unknown;
  customer_address?: unknown;
  delivery_address?: unknown;
  billing_address?: unknown;
  notes?: unknown;
};

type LinePayload = {
  id?: unknown;
  sku?: unknown;
  customer_sku?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
  odoo_product_id?: unknown;
  kind?: unknown;
};

const LINE_KINDS = ["item", "discount", "freight", "surcharge", "adjustment"] as const;
type LineKind = (typeof LINE_KINDS)[number];
function normalizeLineKind(raw: unknown): LineKind {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if ((LINE_KINDS as readonly string[]).includes(v)) return v as LineKind;
  }
  return "item";
}

function text(value: unknown, max = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function nullableText(value: unknown, max = 500) {
  if (value === null || value === "") return null;
  return text(value, max);
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function intValue(value: unknown) {
  const parsed = numberValue(value);
  if (parsed === null) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
}

function money(value: number | null) {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

function normalizeCurrency(value: unknown) {
  const currency = text(value, 3)?.toUpperCase() ?? null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeDate(value: unknown) {
  const date = nullableText(value, 10);
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

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
  let payload: { draft?: DraftPayload; lines?: LinePayload[] };

  try {
    payload = (await req.json()) as { draft?: DraftPayload; lines?: LinePayload[] };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(payload.lines)) {
    return NextResponse.json({ error: "Line items are required" }, { status: 422 });
  }

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("id, document_id, documents!inner(state, provider_id)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!draft) {
    return NextResponse.json({ error: "Order draft not found" }, { status: 404 });
  }

  const documentRow = Array.isArray(draft.documents) ? draft.documents[0] : draft.documents;
  const documentState = documentRow?.state;
  const documentProviderId = (documentRow as { provider_id?: string | null } | null)?.provider_id ?? null;

  if (documentState !== "needs_review") {
    return NextResponse.json({ error: "Document is not editable" }, { status: 409 });
  }

  const normalizedLines = payload.lines.map((line, index) => {
    const quantity = numberValue(line.quantity) ?? 0;
    const unitPrice = numberValue(line.unit_price);
    const taxRate = numberValue(line.tax_rate);
    const lineTotal = unitPrice === null ? null : money(quantity * unitPrice);

    return {
      id: typeof line.id === "string" && line.id.length > 0 ? line.id : null,
      tenant_id: tenantId,
      order_draft_id: id,
      position: index + 1,
      sku: nullableText(line.sku, 120),
      customer_sku: nullableText(line.customer_sku, 120),
      description: text(line.description, 1000) ?? "",
      quantity,
      unit: nullableText(line.unit, 40),
      unit_price: money(unitPrice),
      line_total: lineTotal,
      tax_rate: money(taxRate),
      odoo_product_id: intValue(line.odoo_product_id),
      kind: normalizeLineKind(line.kind),
    };
  });

  if (!normalizedLines.length) {
    return NextResponse.json({ error: "At least one line item is required" }, { status: 422 });
  }

  const subtotal = money(normalizedLines.reduce((sum, line) => sum + (line.line_total ?? 0), 0));
  const taxTotal = money(
    normalizedLines.reduce((sum, line) => {
      const rate = line.tax_rate ?? 0;
      return sum + (line.line_total ?? 0) * rate;
    }, 0),
  );
  const total = money((subtotal ?? 0) + (taxTotal ?? 0));

  const service = createServiceClient();
  const { data: existingLines, error: existingLinesError } = await service
    .from("order_draft_lines")
    .select("id, sku, customer_sku, description, odoo_product_id")
    .eq("tenant_id", tenantId)
    .eq("order_draft_id", id);

  if (existingLinesError) {
    return NextResponse.json({ error: "Failed to load line items" }, { status: 500 });
  }

  const incomingIds = new Set(normalizedLines.map((line) => line.id).filter(Boolean));
  const deletedIds = (existingLines ?? [])
    .map((line) => line.id)
    .filter((lineId) => !incomingIds.has(lineId));

  if (deletedIds.length) {
    const { error: deleteError } = await service
      .from("order_draft_lines")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("order_draft_id", id)
      .in("id", deletedIds);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to delete line items" }, { status: 500 });
    }
  }

  for (const line of normalizedLines) {
    if (line.id) {
      const { error: updateLineError } = await service
        .from("order_draft_lines")
        .update({
          position: line.position,
          sku: line.sku,
          customer_sku: line.customer_sku,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          line_total: line.line_total,
          tax_rate: line.tax_rate,
          odoo_product_id: line.odoo_product_id,
          kind: line.kind,
        })
        .eq("id", line.id)
        .eq("tenant_id", tenantId)
        .eq("order_draft_id", id);

      if (updateLineError) {
        return NextResponse.json({ error: "Failed to update line item" }, { status: 500 });
      }
      continue;
    }

    const { id: _id, ...insertLine } = line;
    const { error: insertLineError } = await service.from("order_draft_lines").insert(insertLine);
    if (insertLineError) {
      return NextResponse.json({ error: "Failed to add line item" }, { status: 500 });
    }
  }

  const buyerName = nullableText(payload.draft?.customer_name, 300);
  const buyerContactPerson = nullableText(payload.draft?.customer_contact_person, 200);
  const customerAddress = nullableText(payload.draft?.customer_address, 1200);

  function normalizeAddressField(
    raw: unknown,
    fallback: string | null,
  ): Record<string, unknown> | null {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      // Structured address object from the new UI — store directly
      return raw as Record<string, unknown>;
    }
    const str = nullableText(raw, 1200) ?? fallback;
    return str ? { line1: str } : null;
  }

  const shippingAddress = normalizeAddressField(payload.draft?.delivery_address, customerAddress);
  const billingAddressVal = normalizeAddressField(payload.draft?.billing_address, customerAddress);

  // Construir el update dinámicamente: solo sobrescribir buyer/shipping/billing
  // cuando el frontend efectivamente mandó contenido. Si vienen vacíos
  // (caso típico: el usuario solo corrigió un SKU sin tocar al cliente),
  // preservar lo que ya hay en la DB.
  type DraftUpdate = {
    po_number: string | null;
    po_date: string | null;
    delivery_date: string | null;
    currency: string | null;
    payment_terms: string | null;
    notes: string | null;
    subtotal: number | null;
    tax_total: number | null;
    total: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buyer?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shipping_address?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    billing_address?: any;
  };
  const draftUpdate: DraftUpdate = {
    po_number: nullableText(payload.draft?.po_number, 120),
    po_date: normalizeDate(payload.draft?.po_date),
    delivery_date: normalizeDate(payload.draft?.delivery_date),
    currency: normalizeCurrency(payload.draft?.currency),
    payment_terms: nullableText(payload.draft?.payment_terms, 500),
    notes: nullableText(payload.draft?.notes, 4000),
    subtotal,
    tax_total: taxTotal,
    total,
  };
  if (buyerName || customerAddress || buyerContactPerson) {
    draftUpdate.buyer = {
      name: buyerName,
      address: customerAddress,
      contact_person: buyerContactPerson,
    };
  }
  if (shippingAddress) {
    draftUpdate.shipping_address = shippingAddress;
  }
  if (billingAddressVal) {
    draftUpdate.billing_address = billingAddressVal;
  }

  const { error: draftUpdateError } = await service
    .from("order_drafts")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(draftUpdate as any)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (draftUpdateError) {
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }

  // Auto-aprendizaje: SIEMPRE que una línea aprobada tenga odoo_product_id
  // resuelto + algún identificador del partner (SKU, customer_sku o
  // descripción), persistir el mapping en provider_product_mappings. Esto
  // garantiza que toda orden aprobada deje un mapeo aprendido, sin depender
  // de que el usuario haya editado la línea. El upsert es idempotente.
  if (documentProviderId && existingLines && existingLines.length > 0) {
    const existingById = new Map<
      string,
      {
        sku: string | null;
        customer_sku: string | null;
        description: string | null;
        odoo_product_id: number | null;
      }
    >();
    for (const row of existingLines as Array<{
      id: string;
      sku: string | null;
      customer_sku: string | null;
      description: string | null;
      odoo_product_id: number | null;
    }>) {
      existingById.set(row.id, {
        sku: row.sku,
        customer_sku: row.customer_sku ?? null,
        description: row.description,
        odoo_product_id: row.odoo_product_id ?? null,
      });
    }

    type MappingInsertRow = {
      tenant_id: string;
      provider_id: string;
      source_sku: string | null;
      source_company_sku: string | null;
      source_description: string | null;
      odoo_default_code: string | null;
      odoo_product_id: number;
      odoo_product_name: string;
      source: "auto";
    };
    const mappingRows: MappingInsertRow[] = [];

    for (const line of normalizedLines) {
      if (!line.id) continue;
      const previous = existingById.get(line.id);
      if (!previous) continue;
      if (!line.odoo_product_id) continue;

      const oldSku = (previous.sku ?? "").trim();
      const newSku = (line.sku ?? "").trim();
      const oldCustomerSku = (previous.customer_sku ?? "").trim();
      const newCustomerSku = (line.customer_sku ?? "").trim();
      const skuChanged = !!oldSku && !!newSku && oldSku !== newSku;
      const customerSkuChanged =
        !!newCustomerSku && newCustomerSku !== oldCustomerSku;
      const productChanged = line.odoo_product_id !== (previous.odoo_product_id ?? null);

      // Aprender SIEMPRE que la línea tenga odoo_product_id resuelto. No
      // requerir que el usuario haya tocado nada: si la PO trae el SKU del
      // partner + se asoció a un producto Odoo, eso ya es un mapeo válido.
      // Las flags se mantienen porque siguen rigiendo qué texto se elige como
      // source_sku vs source_company_sku.
      void skuChanged;
      void customerSkuChanged;
      void productChanged;

      // Source identifier priority — what the partner sends on FUTURE POs:
      // 1. customer_sku (user-confirmed partner code) — STRONGEST signal
      // 2. If SKU changed → old SKU text was the provider's identifier
      // 3. If SKU exists unchanged → use it as source_sku
      // 4. No SKU → use description as fallback identifier
      const sourceSku =
        newCustomerSku ||
        (skuChanged ? oldSku : (newSku || null));
      const sourceDescription = sourceSku
        ? null
        : ((line.description ?? previous.description ?? "").trim() || null);

      // Nothing to identify this product by — skip.
      if (!sourceSku && !sourceDescription) continue;

      mappingRows.push({
        tenant_id: tenantId,
        provider_id: documentProviderId,
        source_sku: sourceSku,
        // source_company_sku captures the OTHER variant when there are two distinct codes.
        // E.g. partner code in source_sku, our internal code in source_company_sku.
        source_company_sku:
          newCustomerSku && newSku && newCustomerSku !== newSku
            ? newSku
            : (skuChanged ? newSku : null),
        source_description: sourceDescription,
        odoo_default_code: newSku || null,
        odoo_product_id: line.odoo_product_id,
        odoo_product_name:
          line.description ?? previous.description ?? newSku ?? "Unknown",
        source: "auto",
      });
    }

    if (mappingRows.length > 0) {
      // No usar .upsert con onConflict: los índices únicos son parciales
      // (WHERE source_sku IS NOT NULL), y PostgREST no soporta partial unique
      // indexes en ON CONFLICT. Hacemos SELECT-then-INSERT/UPDATE por fila.
      for (const row of mappingRows) {
        const lookup = service
          .from("provider_product_mappings")
          .select("id")
          .eq("tenant_id", row.tenant_id)
          .eq("provider_id", row.provider_id);
        const { data: found, error: findErr } = row.source_sku
          ? await lookup.eq("source_sku", row.source_sku).maybeSingle()
          : await lookup.eq("source_description", row.source_description!).maybeSingle();

        if (findErr) {
          console.error("[order-drafts/review] auto-mapping lookup failed:", findErr.message);
          continue;
        }

        const foundId = (found as { id?: string } | null)?.id;
        if (foundId) {
          const { error: updErr } = await service
            .from("provider_product_mappings")
            .update({
              source_company_sku: row.source_company_sku,
              odoo_default_code: row.odoo_default_code,
              odoo_product_id: row.odoo_product_id,
              odoo_product_name: row.odoo_product_name,
              source: row.source,
            })
            .eq("id", foundId)
            .eq("tenant_id", row.tenant_id);
          if (updErr)
            console.error("[order-drafts/review] auto-mapping update failed:", updErr.message);
        } else {
          const { error: insErr } = await service
            .from("provider_product_mappings")
            .insert(row);
          if (insErr)
            console.error("[order-drafts/review] auto-mapping insert failed:", insErr.message);
        }
      }
    }
  }

  const [{ data: savedDraft }, { data: savedLines }] = await Promise.all([
    supabase.from("order_drafts").select("*").eq("id", id).eq("tenant_id", tenantId).single(),
    supabase
      .from("order_draft_lines")
      .select("*")
      .eq("order_draft_id", id)
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true }),
  ]);

  return NextResponse.json({ draft: savedDraft, lines: savedLines ?? [] });
}
