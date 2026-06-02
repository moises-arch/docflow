import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function normalizeQuery(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizePartnerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanText(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isRootCompanyPartner(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const hasCompanySignals =
    Object.hasOwn(record, "is_company") || Object.hasOwn(record, "company_type");
  // Include any company (is_company=true), even subsidiaries with a parent.
  // In Odoo a company can be a branch/subsidiary and still be a valid customer.
  // Backward compatibility: snapshots without is_company stay visible.
  if (!hasCompanySignals) return true;
  return (
    record.is_company === true ||
    record.is_company === 1 ||
    record.is_company === "1" ||
    record.is_company === "true" ||
    record.company_type === "company"
  );
}

type ProviderResolutionDocument = { id: string; provider_id: string | null };
type ProviderResolutionDraft = { review_profile_id: string | null };
type ProviderRecord = { id: string; name: string; code: string };
type ProviderMappingRecord = {
  id: string;
  odoo_partner_id: number;
  odoo_partner_name: string | null;
};
type OdooPartnerCatalogRecord = { external_id: string; name: string; raw: unknown };
type PartnerCatalogQuery = {
  ilike: (column: string, pattern: string) => PartnerCatalogQuery;
  range: (from: number, to: number) => PartnerCatalogQuery;
};

type PartnerCandidate = {
  id: number;
  name: string;
  normalizedName: string;
  score: number;
};

function scorePartnerCandidate(
  candidate: { id: number; name: string; normalizedName: string },
  query: string,
) {
  if (!query) return 0;
  const normalizedQuery = normalizePartnerName(query);
  const idQuery = query.replace(/\D+/g, "");
  const idText = String(candidate.id);

  if (idQuery && idText === idQuery) return 500;
  if (candidate.normalizedName === normalizedQuery) return 400;
  if (candidate.normalizedName.startsWith(normalizedQuery)) return 300;
  if (candidate.normalizedName.split(" ").some((part) => part.startsWith(normalizedQuery)))
    return 220;
  if (`${candidate.normalizedName} ${idText}`.includes(normalizedQuery)) return 140;
  return 0;
}

async function tenantContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  }

  return {
    supabase: supabase as unknown as DynamicSupabaseClient,
    user,
    tenantId: membership.tenant_id,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await tenantContext();
  if ("error" in context) return context.error;

  const { id: documentId } = await params;
  const query = normalizeQuery(new URL(req.url).searchParams.get("q"));
  const numericQuery = query.replace(/\D+/g, "");

  const service = createServiceClient() as unknown as DynamicSupabaseClient;
  const client = context.supabase;

  const { data: document } = await client
    .from<ProviderResolutionDocument>("documents")
    .select("id, provider_id")
    .eq("id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const providerId = typeof document.provider_id === "string" ? document.provider_id : null;
  const { data: draft } = await client
    .from<ProviderResolutionDraft>("order_drafts")
    .select("review_profile_id")
    .eq("document_id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  const partnerQuery = service
    .from<OdooPartnerCatalogRecord[]>("integration_catalog_partners")
    .select("external_id, name, raw")
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .eq("active", true)
    .order("name", { ascending: true }) as unknown as PartnerCatalogQuery;

  if (query && !numericQuery) {
    partnerQuery.ilike("name", `%${escapeLike(query)}%`).range(0, 1999);
  } else if (query) {
    partnerQuery.range(0, 1999);
  } else {
    partnerQuery.range(0, 199);
  }

  const [{ data: provider }, { data: mapping }] = await Promise.all([
    providerId
      ? client
          .from<ProviderRecord>("providers")
          .select("id, name, code")
          .eq("id", providerId)
          .eq("tenant_id", context.tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    providerId
      ? service
          .from<ProviderMappingRecord>("provider_reseller_mappings")
          .select("id, odoo_partner_id, odoo_partner_name")
          .eq("tenant_id", context.tenantId)
          .eq("provider_id", providerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const partnerResult = (await (partnerQuery as unknown as Promise<{
    data: OdooPartnerCatalogRecord[] | null;
  }>)) ?? {
    data: null,
  };
  const partners = partnerResult.data ?? [];

  const partnerRows = (partners ?? []) as OdooPartnerCatalogRecord[];

  const byId = new Map<number, { id: number; name: string; normalizedName: string }>();

  for (const partner of partnerRows) {
    if (!isRootCompanyPartner(partner.raw)) continue;
    const id = Number(partner.external_id);
    const name = cleanText(partner.name, 300);
    if (!Number.isFinite(id) || !name) continue;
    const normalizedName = normalizePartnerName(name);
    const existing = byId.get(id);

    if (!existing || existing.name.length < name.length) {
      byId.set(id, { id, name, normalizedName });
    }
  }

  const byNormalizedName = new Map<string, PartnerCandidate>();
  for (const candidate of byId.values()) {
    const score = scorePartnerCandidate(candidate, query);
    if (query && score === 0) continue;

    const existing = byNormalizedName.get(candidate.normalizedName);
    if (
      !existing ||
      existing.score < score ||
      (existing.score === score && existing.name.length < candidate.name.length) ||
      (existing.score === score &&
        existing.name.length === candidate.name.length &&
        existing.id > candidate.id)
    ) {
      byNormalizedName.set(candidate.normalizedName, { ...candidate, score });
    }
  }

  const candidates = Array.from(byNormalizedName.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    })
    .slice(0, query ? 8 : 0)
    .map(({ id, name }) => ({ id, name }));

  return NextResponse.json({
    document: {
      id: document.id,
      provider_id: providerId,
      review_profile_id: draft?.review_profile_id ?? null,
      resolved: Boolean(providerId && draft?.review_profile_id && mapping?.odoo_partner_id),
    },
    provider: provider
      ? {
          id: provider.id,
          name: provider.name,
          code: provider.code,
        }
      : null,
    reseller_mapping: mapping
      ? {
          id: mapping.id,
          odoo_partner_id: mapping.odoo_partner_id,
          odoo_partner_name: mapping.odoo_partner_name,
        }
      : null,
    candidates,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await tenantContext();
  if ("error" in context) return context.error;

  const { id: documentId } = await params;
  let body: { provider_id?: unknown; odoo_partner_id?: unknown; odoo_partner_name?: unknown };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawProviderId = cleanText(body.provider_id, 80);
  const odooPartnerName = cleanText(body.odoo_partner_name, 300);
  const odooPartnerId = Number(body.odoo_partner_id);

  if (!Number.isFinite(odooPartnerId) || odooPartnerId <= 0) {
    return NextResponse.json({ error: "Invalid provider/reseller payload" }, { status: 422 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;
  const client = context.supabase;

  const { data: document } = await client
    .from<{ id: string }>("documents")
    .select("id")
    .eq("id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // If no provider yet, create one from the Odoo partner name and link it to the document
  let providerId = rawProviderId;
  if (!providerId && odooPartnerName) {
    const code = odooPartnerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    const { data: existing } = await service
      .from<{ id: string }>("providers")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("code", code)
      .maybeSingle();

    if (existing?.id) {
      providerId = existing.id;
    } else {
      const { data: created } = await service
        .from<{ id: string }>("providers")
        .insert({ tenant_id: context.tenantId, name: odooPartnerName, code })
        .select("id")
        .single();
      if (!created?.id) {
        return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
      }
      providerId = created.id;
    }

    await Promise.all([
      service
        .from("documents")
        .update({ provider_id: providerId })
        .eq("id", documentId)
        .eq("tenant_id", context.tenantId),
      service
        .from("order_drafts")
        .update({ provider_id: providerId })
        .eq("document_id", documentId)
        .eq("tenant_id", context.tenantId),
    ]);
  }

  if (!providerId) {
    return NextResponse.json({ error: "Invalid provider/reseller payload" }, { status: 422 });
  }

  const { error } = await service.from("provider_reseller_mappings").upsert(
    {
      tenant_id: context.tenantId,
      provider_id: providerId,
      odoo_partner_id: Math.floor(odooPartnerId),
      odoo_partner_name: odooPartnerName || null,
      created_by: context.user.id,
    },
    { onConflict: "tenant_id,provider_id" },
  );

  if (error) {
    return NextResponse.json(
      { error: "Failed to save provider-reseller mapping" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
