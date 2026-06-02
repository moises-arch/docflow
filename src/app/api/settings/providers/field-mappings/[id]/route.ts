import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext, type DynamicSupabaseClient } from "../../_lib";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;

  const { id } = await params;

  // Verify ownership — the mapping must belong to this tenant
  const { data: existing } = await ctx.supabase
    .from("provider_field_mappings")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;
  const { error } = await service
    .from("provider_field_mappings")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) {
    return NextResponse.json({ error: "Delete failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
