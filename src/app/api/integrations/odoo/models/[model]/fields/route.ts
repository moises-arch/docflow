/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ model: string }> }) {
  const context = await getIntegrationContext({ ownerOnly: false });
  if ("error" in context) return context.error;

  const { model } = await params;
  const decodedModel = decodeURIComponent(model);

  const db = context.supabase as unknown as {
    from: (table: string) => {
      select: (columns?: string) => any;
      eq: (column: string, value: unknown) => any;
      order: (column: string, options?: { ascending?: boolean }) => any;
    };
  };

  const { data, error } = await db
    .from("integration_fields")
    .select(
      "id, model_name, field_name, field_label, field_type, relation_model, required, readonly, writeable, selectable, meta, last_synced_at",
    )
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .eq("model_name", decodedModel)
    .order("field_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch fields" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
