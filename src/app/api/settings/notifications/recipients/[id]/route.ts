import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { active?: boolean; name?: string } | null;
  const update: Record<string, unknown> = {};
  if (typeof body?.active === "boolean") update.active = body.active;
  if (typeof body?.name === "string") update.name = body.name.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const svc = createServiceClient();
  const { error } = await (svc as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  })
    .from("email_recipients")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", membership.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner required" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("email_recipients")
    .delete()
    .eq("id", id)
    .eq("tenant_id", membership.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
