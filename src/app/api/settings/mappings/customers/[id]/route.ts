import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { data, error } = await supabase
    .from("customer_mappings")
    .delete()
    .eq("id", id)
    .eq("tenant_id", membership.tenant_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to delete customer mapping" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Customer mapping not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
