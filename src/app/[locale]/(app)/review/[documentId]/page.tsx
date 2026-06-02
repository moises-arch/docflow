import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ReviewWorkspace } from "./review-workspace";

export const dynamic = "force-dynamic";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type DraftRow = Database["public"]["Tables"]["order_drafts"]["Row"];
type LineRow = Database["public"]["Tables"]["order_draft_lines"]["Row"];
type TargetFieldRow = {
  id: string;
  key: string;
  label: string;
  scope: string;
  target_model: string;
  target_field: string;
  value_type: string;
  required: boolean;
  active: boolean;
  system: boolean;
  sort_order: number;
};

type ReviewProfileRow = {
  id: string;
  layout: Record<string, unknown> | null;
  name: string | null;
};

type FieldAnnotationRow = {
  id: string;
  target_field_key: string;
  source_hint: string | null;
  normalized_text: string | null;
  selection_meta: Record<string, unknown> | null;
  created_at: string;
};

type ProductMappingRow = {
  id: string;
  provider_id: string;
  source_sku: string | null;
  source_company_sku: string | null;
  source_description: string | null;
  odoo_product_id: number;
  odoo_product_name: string;
  odoo_default_code: string | null;
  source: "manual" | "auto" | "imported" | "odoo_catalog";
  confidence: number;
};

type ProviderRow = {
  id: string;
  name: string;
  code: string;
  settings: Record<string, unknown> | null;
};

type DetectedFieldPayload = {
  rects?: unknown;
  provenance?: unknown;
  key?: unknown;
  label?: unknown;
  value?: unknown;
  page?: unknown;
  confidence?: unknown;
  category?: unknown;
  source?: unknown;
};

type DetectedRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number | null;
  provenance: "document_ai" | "pdf_text" | "anchor" | "manual";
};

function isRootCompanyPartner(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  // Include any company (is_company=true), even subsidiaries with a parent company.
  // In ERP a company can be a branch/subsidiary and still be a valid customer.
  // Only exclude individual contacts (is_company=false).
  return record.is_company === true;
}

function safeRect(raw: unknown): DetectedRect | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rect = raw as Record<string, unknown>;
  const pageValue = Number(rect.page ?? 1);
  const page = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1;
  const x = Number(rect.x ?? 0);
  const y = Number(rect.y ?? 0);
  const width = Number(rect.width ?? 0);
  const height = Number(rect.height ?? 0);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  const provenance =
    rect.provenance === "pdf_text" ||
    rect.provenance === "anchor" ||
    rect.provenance === "manual" ||
    rect.provenance === "document_ai"
      ? rect.provenance
      : "document_ai";
  const confidence = Number(rect.confidence);

  return {
    page,
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    width: Math.min(1, Math.max(0, width)),
    height: Math.min(1, Math.max(0, height)),
    confidence: Number.isFinite(confidence) ? confidence : null,
    provenance,
  };
}

function safeProvenance(raw: unknown): "document_ai" | "pdf_text" | "anchor" | "manual" | null {
  return raw === "pdf_text" || raw === "anchor" || raw === "manual" || raw === "document_ai"
    ? raw
    : null;
}

function jsonText(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) && key in value
    ? String((value as Record<string, unknown>)[key] ?? "")
    : "";
}

function addressText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;

  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = record[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const name = str(["name", "recipient"]);
  const street = str(["street", "line1", "line2", "address"]);
  const city = str(["city", "town"]);
  const state = str(["state", "province"]);
  const zip = str(["zip", "postal_code", "postcode"]);
  const country = str(["country", "country_name"]);
  const stateZip = [state, zip].filter(Boolean).join(" ");

  return [name, street, city, stateZip, country].filter(Boolean).join(", ") || street;
}

function detectedFieldsFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  const fields = (payload as Record<string, unknown>).detected_fields;
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field): field is DetectedFieldPayload => typeof field === "object" && field !== null)
    .map((field) => {
      const label = typeof field.label === "string" ? field.label.trim() : "";
      const value =
        typeof field.value === "string"
          ? field.value.trim()
          : typeof field.value === "number" && Number.isFinite(field.value)
            ? String(field.value)
            : "";
      const key = typeof field.key === "string" ? field.key.trim() : label;
      const page = typeof field.page === "number" && Number.isFinite(field.page) ? field.page : 1;
      const confidence =
        typeof field.confidence === "number" && Number.isFinite(field.confidence)
          ? field.confidence
          : null;

      if (!label || !value) return null;

      return {
        key,
        label,
        value,
        page: Math.max(1, Math.floor(page)),
        confidence,
        category: typeof field.category === "string" ? field.category : "other",
        source: typeof field.source === "string" ? field.source : "pipeline",
        rects: Array.isArray(field.rects)
          ? field.rects.map(safeRect).filter((rect): rect is DetectedRect => Boolean(rect))
          : [],
        provenance: safeProvenance(field.provenance),
      };
    })
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .slice(0, 300);
}

export default async function ReviewPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const supabase = await createClient();
  const db = supabase as unknown as DynamicSupabaseClient;
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    redirect(`/${locale}/select-tenant`);
  }

  const tenantId = membership.tenant_id;

  const { data: document } = await supabase
    .from("documents")
    .select("*, doc_number")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .single<DocumentRow & { doc_number?: string | null }>();

  if (!document) {
    redirect(`/${locale}/inbox`);
  }

  const { data: draft } = await supabase
    .from("order_drafts")
    .select("*")
    .eq("document_id", documentId)
    .eq("tenant_id", tenantId)
    .single<DraftRow>();

  if (!draft) {
    redirect(`/${locale}/inbox`);
  }

  const { data: lines } = await supabase
    .from("order_draft_lines")
    .select("*")
    .eq("order_draft_id", draft.id)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true })
    .returns<LineRow[]>();

  // extraction_id is nullable on order_drafts (some drafts have no extraction
  // yet, e.g. while ai-process is still running). Skip the lookup in that case.
  const { data: extraction } = draft.extraction_id
    ? await supabase
        .from("extractions")
        .select("payload")
        .eq("id", draft.extraction_id)
        .eq("tenant_id", tenantId)
        .maybeSingle()
    : { data: null };

  const reviewProfileId =
    draft && typeof draft === "object" && "review_profile_id" in (draft as Record<string, unknown>)
      ? ((draft as Record<string, unknown>).review_profile_id as string | null)
      : null;
  // Fetch ALL active target fields for the tenant — not filtered by profile.
  // Studio needs the full catalog of learnable ERP fields regardless of which
  // review profile (if any) is assigned to this document.
  // Profile-specific layout is handled separately via profileLayout.
  const targetFieldsQuery = db
    .from<TargetFieldRow[]>("target_fields")
    .select(
      "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order",
    )
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("scope", { ascending: true })
    .order("sort_order", { ascending: true });

  const [{ data: targetFields }, { data: reviewProfile }] = await Promise.all([
    targetFieldsQuery,
    reviewProfileId
      ? db
          .from<ReviewProfileRow>("review_profiles")
          .select("id, layout, name")
          .eq("tenant_id", tenantId)
          .eq("id", reviewProfileId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // ── Neighbors para navegación prev/next ────────────────────────────────────
  // Mismo filtro que /inbox para que el usuario pueda saltar entre pendientes
  // sin volver al listado. Solo nos importa el doc anterior y el siguiente.
  const { data: neighborRows } = await supabase
    .from("documents")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("state", ["uploaded", "processing", "needs_review", "failed_processing"])
    .order("created_at", { ascending: false })
    .limit(500);
  const neighborIds = (neighborRows ?? []).map((r) => r.id);
  const currentIdx = neighborIds.indexOf(document.id);
  const prevDocId = currentIdx > 0 ? neighborIds[currentIdx - 1] : null;
  const nextDocId =
    currentIdx >= 0 && currentIdx < neighborIds.length - 1
      ? neighborIds[currentIdx + 1]
      : null;

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(document.storage_path, 60 * 60);

  // Buscar packing slips del mismo email.
  // Estrategia 1: documentos con source_meta.is_packing_slip = true
  // Estrategia 2 (fallback): inbound_email_attachments con nombre que parezca packing slip
  // Necesario porque el email pudo haberse procesado antes de configurar los patterns.
  const inboundEmailId = typeof (document as Record<string, unknown>).source_ref === "string"
    ? (document as Record<string, unknown>).source_ref as string
    : null;

  const PACKING_SLIP_FILENAME_RE = /packing[\s_-]?slip|packingslip|packing[\s_-]list/i;

  type PackingSlipRow = { id: string; original_name: string | null; size_bytes: number | null; storage_path: string };
  type AttachmentRow2 = { id: string; original_name: string | null; size_bytes: number | null; storage_path: string };
  const packingSlipDocs: Array<{ id: string; name: string; sizeBytes: number; signedUrl: string | null }> = [];

  if (inboundEmailId) {
    // Estrategia 1: documentos con is_packing_slip flag
    const { data: psRows } = await db
      .from<PackingSlipRow[]>("documents")
      .select("id, original_name, size_bytes, storage_path")
      .eq("tenant_id", tenantId)
      .eq("source_ref", inboundEmailId)
      .eq("source_meta->>is_packing_slip", "true");

    for (const ps of psRows ?? []) {
      const { data: psSigned } = await supabase.storage
        .from("documents")
        .createSignedUrl(ps.storage_path, 60 * 60);
      packingSlipDocs.push({
        id: ps.id,
        name: ps.original_name ?? "PackingSlip.pdf",
        sizeBytes: ps.size_bytes ?? 0,
        signedUrl: psSigned?.signedUrl ?? null,
      });
    }

    // Estrategia 2: attachments del mismo email con nombre de packing slip
    // (fallback: email procesado antes de configurar patterns)
    if (packingSlipDocs.length === 0) {
      const { data: attRows } = await db
        .from<AttachmentRow2[]>("inbound_email_attachments")
        .select("id, original_name, size_bytes, storage_path")
        .eq("tenant_id", tenantId)
        .eq("inbound_email_id", inboundEmailId);

      for (const att of attRows ?? []) {
        if (!att.original_name || !PACKING_SLIP_FILENAME_RE.test(att.original_name)) continue;
        if (!att.storage_path) continue;
        const { data: attSigned } = await supabase.storage
          .from("documents")
          .createSignedUrl(att.storage_path, 60 * 60);
        packingSlipDocs.push({
          id: att.id,
          name: att.original_name,
          sizeBytes: att.size_bytes ?? 0,
          signedUrl: attSigned?.signedUrl ?? null,
        });
      }
    }
  }
  const providerId =
    typeof (document as Record<string, unknown>).provider_id === "string"
      ? ((document as Record<string, unknown>).provider_id as string)
      : null;
  const reviewProfileIdFromDraft =
    typeof (draft as Record<string, unknown>).review_profile_id === "string"
      ? ((draft as Record<string, unknown>).review_profile_id as string)
      : null;

  const [
    { data: provider },
    { data: mapping },
    { data: partners },
    { data: fieldAnnotations },
    { data: odooProducts },
    { data: productMappings },
  ] = await Promise.all([
    providerId
      ? db
          .from<ProviderRow>("providers")
          .select("id, name, code, settings")
          .eq("tenant_id", tenantId)
          .eq("id", providerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    providerId
      ? db
          .from<{
            id: string;
            odoo_partner_id: number;
            odoo_partner_name: string | null;
          }>("provider_reseller_mappings")
          .select("id, odoo_partner_id, odoo_partner_name")
          .eq("tenant_id", tenantId)
          .eq("provider_id", providerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from<
        Array<{ external_id: string; name: string; raw: unknown }>
      >("integration_catalog_partners")
      .select("external_id, name, raw")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .order("name", { ascending: true })
      .limit(3000),
    providerId
      ? db
          .from<FieldAnnotationRow[]>("provider_field_annotations")
          .select("id, target_field_key, source_hint, normalized_text, selection_meta, created_at")
          .eq("tenant_id", tenantId)
          .eq("provider_id", providerId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    // Use the synced catalog (integration_catalog_products) — always available regardless of provider
    db
      .from<Array<{ external_id: string; name: string; code: string | null; barcode: string | null; uom: string | null }>>(
        "integration_catalog_products",
      )
      .select("external_id, name, code, barcode, uom")
      .eq("tenant_id", tenantId)
      .eq("provider", "odoo")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(5000),
    providerId
      ? db
          .from<ProductMappingRow[]>("provider_product_mappings")
          .select(
            "id, provider_id, source_sku, source_company_sku, source_description, odoo_product_id, odoo_product_name, odoo_default_code, source, confidence",
          )
          .eq("tenant_id", tenantId)
          .eq("provider_id", providerId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const resellerCandidates = (partners ?? [])
    .filter((partner) => isRootCompanyPartner(partner.raw))
    .map((partner) => ({ id: Number(partner.external_id), name: partner.name }))
    .filter((partner) => Number.isFinite(partner.id))
    .slice(0, 100);

  const detectionStatus =
    draft.meta && typeof draft.meta === "object" && "auto_template" in draft.meta
      ? ((draft.meta as Record<string, unknown>).auto_template as Record<string, unknown> | null)
          ?.detection_status
      : null;

  const userData = {
    id: user.id,
    email: user.email ?? "",
    name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
  };

  return (
    <ReviewWorkspace
        currentUser={userData}
        document={{
          id: document.id,
          docNumber: (document as Record<string, unknown>).doc_number as string | null ?? null,
          originalName: document.original_name,
          mimeType: document.mime_type,
          state: document.state,
          pageCount: document.page_count,
          signedUrl: signed?.signedUrl ?? null,
          providerId,
          reviewProfileId: reviewProfileIdFromDraft,
          createdAt: document.created_at,
          detectionStatus:
            detectionStatus === "resolved" || detectionStatus === "unresolved"
              ? detectionStatus
              : null,
        }}
        reviewProfileName={reviewProfile?.name ?? null}
        prevDocId={prevDocId}
        nextDocId={nextDocId}
        draft={{
          id: draft.id,
          po_number: draft.po_number,
          po_date: draft.po_date,
          delivery_date: (draft as { delivery_date?: string | null }).delivery_date ?? null,
          currency: draft.currency,
          payment_terms: draft.payment_terms ?? null,
          notes: draft.notes,
          subtotal: draft.subtotal,
          tax_total: draft.tax_total,
          total: draft.total,
          sync_state: draft.sync_state,
          odoo_so_id: draft.odoo_so_id,
          odoo_so_name: draft.odoo_so_name,
          mock:
            Boolean(draft.meta && typeof draft.meta === "object" && "mode" in draft.meta) &&
            (draft.meta as { mode?: unknown }).mode === "mock",
          customer_address:
            jsonText(draft.buyer, "address") ||
            addressText(draft.shipping_address) ||
            addressText(draft.billing_address),
          delivery_address: draft.shipping_address ?? null,
          billing_address: draft.billing_address ?? null,
          customer_name: jsonText(draft.buyer, "name"),
          customer_contact_person: jsonText(draft.buyer, "contact_person"),
        }}
        lines={(lines ?? []).map((line) => ({
          id: line.id,
          position: line.position,
          sku: line.sku,
          customer_sku: (line as LineRow & { customer_sku?: string | null }).customer_sku ?? null,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          line_total: line.line_total,
          tax_rate: line.tax_rate,
          odoo_product_id: line.odoo_product_id,
          kind: ((line as LineRow & { kind?: string | null }).kind ?? "item") as "item" | "discount" | "freight" | "surcharge" | "adjustment",
        }))}
        targetFields={(targetFields ?? []).map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          scope: field.scope,
          required: field.required,
        }))}
        profileLayout={reviewProfile?.layout ?? null}
        extractionPayload={extraction?.payload ?? null}
        detectedFields={detectedFieldsFromPayload(extraction?.payload)}
        initialProviderResolution={{
          document: {
            resolved: Boolean(providerId && reviewProfileIdFromDraft && mapping?.odoo_partner_id),
            provider_id: providerId,
            review_profile_id: reviewProfileIdFromDraft,
          },
          provider: provider ?? null,
          reseller_mapping: mapping ?? null,
          candidates: resellerCandidates,
        }}
        initialFieldAnnotations={fieldAnnotations ?? []}
        odooProducts={(odooProducts ?? []).map((p) => ({
          odoo_product_id: Number(p.external_id),
          name: p.name,
          default_code: p.code ?? null,
          barcode: p.barcode ?? null,
          uom_name: p.uom ?? null,
        }))}
        productMappings={productMappings ?? []}
        providerSettings={provider?.settings ?? {}}
        packingSlipDocs={packingSlipDocs}
      />
  );
}
