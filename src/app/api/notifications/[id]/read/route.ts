import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS de notifications restringe el scope; si el id es de otro tenant, el upsert no encuentra match.
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ user_id: user.id, notification_id: id });

  if (error) {
    return NextResponse.json({ error: "Failed to mark read", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
