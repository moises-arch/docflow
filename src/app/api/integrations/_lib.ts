import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function getIntegrationContext({ ownerOnly = true }: { ownerOnly?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  }

  if (ownerOnly && membership.role !== "owner") {
    return { error: NextResponse.json({ error: "Owner access required" }, { status: 403 }) };
  }

  return {
    supabase,
    tenantId: membership.tenant_id,
    role: membership.role,
  };
}
