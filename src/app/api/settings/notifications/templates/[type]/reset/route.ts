import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { EMAIL_TEMPLATE_DEFAULTS } from "../../route";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const def = EMAIL_TEMPLATE_DEFAULTS[type];
  if (!def) return NextResponse.json({ error: "Invalid type" }, { status: 422 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner required" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("email_templates").upsert(
    { tenant_id: membership.tenant_id, type, subject: def.subject, intro: def.intro, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,type" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, defaults: def });
}
