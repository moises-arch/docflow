import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const service = createServiceClient();

  // Traer ids del tenant que NO tienen entrada en notification_reads para este usuario.
  const { data } = await service
    .from("notifications")
    .select(`id, notification_reads!left(user_id)`)
    .eq("tenant_id", membership.tenant_id);

  type Row = { id: string; notification_reads: Array<{ user_id: string }> | null };
  const unreadIds = ((data as Row[] | null) ?? [])
    .filter((r) => !r.notification_reads?.some((nr) => nr.user_id === user.id))
    .map((r) => r.id);

  if (unreadIds.length === 0) {
    return NextResponse.json({ marked: 0 });
  }

  const rows = unreadIds.map((id) => ({ user_id: user.id, notification_id: id }));
  const { error } = await service.from("notification_reads").insert(rows);

  if (error) {
    return NextResponse.json({ error: "Failed to mark all read", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ marked: unreadIds.length });
}
