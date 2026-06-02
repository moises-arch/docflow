import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * GET /api/settings/auto-approve
 * Returns the tenant's current auto_approve_clean setting.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "no tenant" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from("tenants")
    .select("auto_approve_clean")
    .eq("id", membership.tenant_id)
    .single();

  return NextResponse.json({ enabled: (tenant?.auto_approve_clean as boolean | undefined) ?? false });
}

/**
 * PATCH /api/settings/auto-approve
 * Body: { enabled: boolean }
 * Toggles the tenant's auto_approve_clean setting.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "no tenant" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (supabase as any)
    .from("tenants")
    .update({ auto_approve_clean: body.enabled })
    .eq("id", membership.tenant_id)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "update blocked by RLS — only tenant owners can change this setting" },
      { status: 403 },
    );
  }
  return NextResponse.json({ enabled: body.enabled });
}
