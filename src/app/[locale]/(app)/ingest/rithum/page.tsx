import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../settings/_lib";
import { RithumResumenClient } from "./rithum-resumen-client";

export default async function RithumIngestPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  type OrderRow = {
    id: string;
    rithum_order_number: string;
    inbound_email_id: string | null;
    state: string;
    attempts: number;
    last_error: string | null;
    pdf_source: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: orders } = await db
    .from<OrderRow>("rithum_orders")
    .select("id,rithum_order_number,inbound_email_id,state,attempts,last_error,pdf_source,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const ordersList = (Array.isArray(orders) ? orders : []) as OrderRow[];

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = ordersList.filter((o) => new Date(o.created_at).getTime() >= sevenDaysAgo);
  const sourceBreakdown = {
    email: recent.filter((o) => o.inbound_email_id).length,
    scan_rescue: recent.filter((o) => !o.inbound_email_id).length,
  };

  const stats = {
    total: ordersList.length,
    downloaded: ordersList.filter((o) => o.state === "downloaded").length,
    pending: ordersList.filter((o) => o.state === "pending" || o.state === "running").length,
    failed: ordersList.filter((o) => o.state === "failed").length,
    manual_required: ordersList.filter((o) => o.state === "manual_required").length,
    last_downloaded_at:
      ordersList
        .filter((o) => o.state === "downloaded")
        .map((o) => o.updated_at)
        .sort()
        .pop() ?? null,
    source_breakdown: sourceBreakdown,
  };

  return <RithumResumenClient stats={stats} />;
}
