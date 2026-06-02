import { getIntegrationContext } from "@/app/api/integrations/_lib";
import { NextRequest, NextResponse } from "next/server";

const DOC_KINDS = new Set(["purchase_order", "invoice", "shipping", "receipt", "custom"]);

function clean(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseSortOrder(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.max(0, Math.min(9999, Math.floor(value)));
  return normalized;
}

function parseLayout(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type ReviewProfileRow = {
  id: string;
  name: string;
  slug: string;
  document_kind: string;
  description: string | null;
  layout: Record<string, unknown> | null;
  active: boolean;
  system: boolean;
  sort_order: number;
  updated_at: string;
};

type CurrentProfile = {
  id: string;
  system: boolean;
};

type ReviewProfilesQuery = {
  select: (columns?: string) => ReviewProfilesQuery;
  eq: (column: string, value: unknown) => ReviewProfilesQuery;
  update: (values: Record<string, unknown>) => ReviewProfilesQuery;
  single: () => Promise<{ data: ReviewProfileRow | null; error: { message?: string } | null }>;
};

type CurrentProfileQuery = {
  select: (columns?: string) => CurrentProfileQuery;
  eq: (column: string, value: unknown) => CurrentProfileQuery;
  single: () => Promise<{ data: CurrentProfile | null; error: { message?: string } | null }>;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getIntegrationContext({ ownerOnly: true });
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const reviewProfiles = context.supabase.from(
    "review_profiles" as never,
  ) as unknown as ReviewProfilesQuery;
  const currentProfiles = context.supabase.from(
    "review_profiles" as never,
  ) as unknown as CurrentProfileQuery;

  const { data: current, error: currentError } = await currentProfiles
    .select("id, system")
    .eq("tenant_id", context.tenantId)
    .eq("id", id)
    .single();

  if (currentError || !current) {
    return NextResponse.json({ error: "Review profile not found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if ("name" in body) {
    const name = clean(body.name, 120);
    if (!name) return NextResponse.json({ error: "Invalid profile name" }, { status: 422 });
    patch.name = name;
  }

  if ("description" in body) {
    const description = clean(body.description, 800);
    patch.description = description || null;
  }

  if ("document_kind" in body) {
    const documentKind = clean(body.document_kind, 32).toLowerCase();
    if (!DOC_KINDS.has(documentKind)) {
      return NextResponse.json({ error: "Invalid document kind" }, { status: 422 });
    }
    if (current.system) {
      return NextResponse.json(
        { error: "System profiles cannot change document kind" },
        { status: 422 },
      );
    }
    patch.document_kind = documentKind;
  }

  if ("active" in body) {
    const active = body.active === true;
    if (current.system && !active) {
      return NextResponse.json({ error: "System profiles cannot be disabled" }, { status: 422 });
    }
    patch.active = active;
  }

  if ("sort_order" in body) {
    const sortOrder = parseSortOrder(body.sort_order);
    if (sortOrder === null)
      return NextResponse.json({ error: "Invalid sort order" }, { status: 422 });
    patch.sort_order = sortOrder;
  }

  if ("layout" in body) {
    const layout = parseLayout(body.layout);
    if (!layout) return NextResponse.json({ error: "Invalid layout" }, { status: 422 });
    patch.layout = layout;
  }

  if ("normalize_billing_from_odoo_partner" in body) {
    patch.normalize_billing_from_odoo_partner = body.normalize_billing_from_odoo_partner === true;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No changes provided" }, { status: 422 });
  }

  const { data, error } = await reviewProfiles
    .update(patch)
    .eq("tenant_id", context.tenantId)
    .eq("id", id)
    .select(
      "id, name, slug, document_kind, description, layout, active, system, sort_order, updated_at, normalize_billing_from_odoo_partner",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update review profile" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

type DeleteQuery = {
  select: (columns?: string) => DeleteQuery;
  eq: (column: string, value: unknown) => DeleteQuery;
  delete: () => DeleteQuery;
  single: () => Promise<{ data: { id: string; system: boolean; name: string } | null; error: { message?: string } | null }>;
} & Promise<{ data: unknown; error: { message?: string } | null }>;

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getIntegrationContext({ ownerOnly: true });
  if ("error" in context) return context.error;

  const tableForLookup = context.supabase.from(
    "review_profiles" as never,
  ) as unknown as DeleteQuery;
  const tableForDelete = context.supabase.from(
    "review_profiles" as never,
  ) as unknown as DeleteQuery;

  const { data: current, error: lookupError } = await tableForLookup
    .select("id, name, system")
    .eq("tenant_id", context.tenantId)
    .eq("id", id)
    .single();

  if (lookupError || !current) {
    return NextResponse.json({ error: "Review profile not found" }, { status: 404 });
  }

  if (current.system) {
    return NextResponse.json(
      { error: "System profiles cannot be deleted" },
      { status: 422 },
    );
  }

  const { error: deleteError } = await tableForDelete
    .delete()
    .eq("tenant_id", context.tenantId)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete review profile", detail: deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
