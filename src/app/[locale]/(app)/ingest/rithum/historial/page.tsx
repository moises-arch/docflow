import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../../settings/_lib";
import type { RithumOrderRow } from "../rithum-dashboard-client";
import { RithumHistorialClient } from "./rithum-historial-client";

export default async function RithumHistorialPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  type OrderRow = {
    id: string;
    rithum_order_number: string;
    rithum_partner: string | null;
    rithum_status: string | null;
    inbound_email_id: string | null;
    document_id: string | null;
    state: string;
    attempts: number;
    last_error: string | null;
    pdf_source: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: orders } = await db
    .from<OrderRow>("rithum_orders")
    .select(
      "id,rithum_order_number,rithum_partner,rithum_status,inbound_email_id,document_id,state,attempts,last_error,pdf_source,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const ordersList = (Array.isArray(orders) ? orders : []) as OrderRow[];

  const failedCount = ordersList.filter((o) => o.state === "failed").length;
  const pendingCount = ordersList.filter(
    (o) => o.state === "pending" || o.state === "running",
  ).length;

  return (
    <RithumHistorialClient
      orders={ordersList as RithumOrderRow[]}
      failedCount={failedCount}
      pendingCount={pendingCount}
    />
  );
}
