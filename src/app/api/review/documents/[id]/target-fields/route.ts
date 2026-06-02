import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id: documentId } = await params;
  const db = supabase as unknown as DynamicSupabaseClient;

  const { data: draft } = await db
    .from<{ review_profile_id: string | null }>("order_drafts")
    .select("review_profile_id")
    .eq("document_id", documentId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  const reviewProfileId = draft?.review_profile_id ?? null;

  let query = db
    .from<{
      id: string;
      key: string;
      label: string;
      scope: string;
      required: boolean;
    }>("target_fields")
    .select("id, key, label, scope, required")
    .eq("tenant_id", membership.tenant_id)
    .eq("active", true)
    .order("scope", { ascending: true })
    .order("sort_order", { ascending: true });

  if (reviewProfileId) {
    query = query.eq("review_profile_id", reviewProfileId);
  }

  const { data: fields, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch target fields" }, { status: 500 });
  }

  return NextResponse.json({ fields: fields ?? [] });
}
