import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../../../settings/_lib";
import type { CleoOrderRow } from "../cleo-dashboard-client";
import { CleoHistorialClient } from "./cleo-historial-client";

export default async function CleoHistorialPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const db = supabase as unknown as DynamicSupabaseClient;

  type OrderRow = {
    id: string;
    cleo_message_id: string;
    cleo_reference: string | null;
    cleo_batch_id: string | null;
    trading_partner: string | null;
    inbound_email_id: string | null;
    document_id: string | null;
    html_storage_path: string | null;
    state: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: orders } = await db
    .from<OrderRow>("cleo_orders")
    .select(
      "id,cleo_message_id,cleo_reference,cleo_batch_id,trading_partner,inbound_email_id,document_id,html_storage_path,state,attempts,last_error,created_at,updated_at",
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
    <CleoHistorialClient
      orders={ordersList as CleoOrderRow[]}
      failedCount={failedCount}
      pendingCount={pendingCount}
    />
  );
}
