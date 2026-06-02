import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
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

  const { count: total } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", membership.tenant_id);

  // Reads del usuario para notifications de este tenant
  const { count: readCount } = await service
    .from("notification_reads")
    .select("notification_id, notifications!inner(tenant_id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("notifications.tenant_id", membership.tenant_id);

  const unread = Math.max(0, (total ?? 0) - (readCount ?? 0));
  return NextResponse.json({ unread });
}
