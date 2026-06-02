/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

export async function GET(_req?: Request) {
  const context = await getIntegrationContext({ ownerOnly: false });
  if ("error" in context) return context.error;

  const db = context.supabase as unknown as {
    from: (table: string) => {
      select: (columns?: string) => any;
      eq: (column: string, value: unknown) => any;
      order: (column: string, options?: { ascending?: boolean }) => any;
    };
  };

  const { data, error } = await db
    .from("integration_models")
    .select("id, model_name, model_label, transient, abstract, manual, last_synced_at")
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .order("model_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
