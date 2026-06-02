import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const DOC_KINDS = new Set(["purchase_order", "invoice", "shipping", "receipt", "custom"]);

function clean(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseLayout(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
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

type ReviewProfilesQuery = {
  select: (columns?: string) => ReviewProfilesQuery;
  eq: (column: string, value: unknown) => ReviewProfilesQuery;
  order: (column: string, options?: { ascending?: boolean }) => ReviewProfilesQuery;
  insert: (values: Record<string, unknown>) => ReviewProfilesQuery;
  single: () => Promise<{ data: ReviewProfileRow | null; error: { message?: string } | null }>;
};

export async function GET(_req?: Request) {
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

  const reviewProfiles = supabase.from(
    "review_profiles" as never,
  ) as unknown as ReviewProfilesQuery;
  const { data, error } = (await reviewProfiles
    .select(
      "id, name, slug, document_kind, description, layout, active, system, sort_order, updated_at",
    )
    .eq("tenant_id", membership.tenant_id)
    .eq("active", true)
    .order("sort_order", { ascending: true })) as unknown as {
    data: ReviewProfileRow[] | null;
    error: { message?: string } | null;
  };

  if (error) {
    return NextResponse.json({ error: "Failed to load review profiles" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only owners can create profiles" }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = clean(payload.name, 120);
  const slug = clean(payload.slug || name, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const documentKind = clean(payload.document_kind, 32).toLowerCase();
  const description = clean(payload.description, 600) || null;
  const layout = parseLayout(payload.layout);

  if (!name || !slug || !DOC_KINDS.has(documentKind)) {
    return NextResponse.json({ error: "Invalid review profile payload" }, { status: 422 });
  }

  const reviewProfiles = supabase.from(
    "review_profiles" as never,
  ) as unknown as ReviewProfilesQuery;
  const { data, error } = await reviewProfiles
    .insert({
      tenant_id: membership.tenant_id,
      name,
      slug,
      document_kind: documentKind,
      description,
      system: false,
      active: true,
      layout,
    })
    .select(
      "id, name, slug, document_kind, description, layout, active, system, sort_order, updated_at",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create review profile" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
