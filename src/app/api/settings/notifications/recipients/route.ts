import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_TYPES = new Set(["order_approved", "daily_digest", "all"]);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id").eq("user_id", user.id).single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "No tenant" }, { status: 403 });

  const svc = createServiceClient();
  const { data } = await svc
    .from("email_recipients")
    .select("id, email, name, type, active, created_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ recipients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "No tenant" }, { status: 403 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Owner required" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: string; name?: string; type?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const name = body?.name?.trim() || null;
  const type = body?.type;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 422 });
  }
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 422 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("email_recipients")
    .insert({ tenant_id: membership.tenant_id, email, name, type })
    .select("id, email, name, type, active")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Email ya registrado para este tipo" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ recipient: data }, { status: 201 });
}
