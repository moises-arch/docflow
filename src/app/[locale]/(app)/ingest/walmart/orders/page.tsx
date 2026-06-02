import { requireSettingsAccess } from "../../../settings/_lib";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  walmart_po_id: string;
  customer_order_id: string | null;
  state: string;
  source: string;
  attempts: number;
  last_error: string | null;
  document_id: string | null;
  parsed_payload: { totals?: { grand_total?: number } } | null;
  acknowledged_at: string | null;
  created_at: string;
};

export default async function OrdersPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const { data } = await supabase
    .from("walmart_orders")
    .select(
      "id,walmart_po_id,customer_order_id,state,source,attempts,last_error,document_id,parsed_payload,acknowledged_at,created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Order[]>();

  return <OrdersClient orders={(data ?? []) as Order[]} />;
}
