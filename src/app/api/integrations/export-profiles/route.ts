/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

type ExportFlow = "sales_order" | "purchase_order" | "invoice" | "shipping" | "custom";

const FLOW_MODELS: Record<Exclude<ExportFlow, "custom">, { root: string; line: string | null }> = {
  sales_order: { root: "sale.order", line: "sale.order.line" },
  purchase_order: { root: "purchase.order", line: "purchase.order.line" },
  invoice: { root: "account.move", line: "account.move.line" },
  shipping: { root: "stock.picking", line: "stock.move" },
};

function fallbackProfileName(flow: ExportFlow) {
  switch (flow) {
    case "sales_order":
      return "Sales Orders";
    case "purchase_order":
      return "Purchase Orders";
    case "invoice":
      return "Invoices";
    case "shipping":
      return "Shipping";
    default:
      return "Custom Export";
  }
}

function defaultMappings(flow: ExportFlow) {
  if (flow === "sales_order") {
    return [
      {
        scope: "header",
        source_path: "customer_name",
        destination_model: "sale.order",
        destination_field: "partner_id",
        required: true,
      },
      {
        scope: "header",
        source_path: "po_number",
        destination_model: "sale.order",
        destination_field: "client_order_ref",
        required: false,
      },
      {
        scope: "header",
        source_path: "po_date",
        destination_model: "sale.order",
        destination_field: "date_order",
        required: false,
      },
      {
        scope: "header",
        source_path: "notes",
        destination_model: "sale.order",
        destination_field: "note",
        required: false,
      },
      {
        scope: "line",
        source_path: "line.sku",
        destination_model: "sale.order.line",
        destination_field: "product_id",
        required: false,
      },
      {
        scope: "line",
        source_path: "line.description",
        destination_model: "sale.order.line",
        destination_field: "name",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.quantity",
        destination_model: "sale.order.line",
        destination_field: "product_uom_qty",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.unit_price",
        destination_model: "sale.order.line",
        destination_field: "price_unit",
        required: true,
      },
    ];
  }

  if (flow === "purchase_order") {
    return [
      {
        scope: "header",
        source_path: "customer_name",
        destination_model: "purchase.order",
        destination_field: "partner_id",
        required: true,
      },
      {
        scope: "header",
        source_path: "po_number",
        destination_model: "purchase.order",
        destination_field: "partner_ref",
        required: false,
      },
      {
        scope: "header",
        source_path: "po_date",
        destination_model: "purchase.order",
        destination_field: "date_order",
        required: false,
      },
      {
        scope: "line",
        source_path: "line.sku",
        destination_model: "purchase.order.line",
        destination_field: "product_id",
        required: false,
      },
      {
        scope: "line",
        source_path: "line.description",
        destination_model: "purchase.order.line",
        destination_field: "name",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.quantity",
        destination_model: "purchase.order.line",
        destination_field: "product_qty",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.unit_price",
        destination_model: "purchase.order.line",
        destination_field: "price_unit",
        required: true,
      },
    ];
  }

  if (flow === "invoice") {
    return [
      {
        scope: "header",
        source_path: "customer_name",
        destination_model: "account.move",
        destination_field: "partner_id",
        required: true,
      },
      {
        scope: "header",
        source_path: "po_number",
        destination_model: "account.move",
        destination_field: "ref",
        required: false,
      },
      {
        scope: "header",
        source_path: "po_date",
        destination_model: "account.move",
        destination_field: "invoice_date",
        required: false,
      },
      {
        scope: "line",
        source_path: "line.description",
        destination_model: "account.move.line",
        destination_field: "name",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.quantity",
        destination_model: "account.move.line",
        destination_field: "quantity",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.unit_price",
        destination_model: "account.move.line",
        destination_field: "price_unit",
        required: true,
      },
    ];
  }

  if (flow === "shipping") {
    return [
      {
        scope: "header",
        source_path: "po_number",
        destination_model: "stock.picking",
        destination_field: "origin",
        required: false,
      },
      {
        scope: "header",
        source_path: "customer_name",
        destination_model: "stock.picking",
        destination_field: "partner_id",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.description",
        destination_model: "stock.move",
        destination_field: "name",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.quantity",
        destination_model: "stock.move",
        destination_field: "product_uom_qty",
        required: true,
      },
      {
        scope: "line",
        source_path: "line.sku",
        destination_model: "stock.move",
        destination_field: "product_id",
        required: false,
      },
    ];
  }

  return [];
}

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
    .from("export_profiles")
    .select("id, name, flow, root_model, line_model, active, settings, created_at, updated_at")
    .eq("tenant_id", context.tenantId)
    .eq("provider", "odoo")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch export profiles" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const context = await getIntegrationContext({ ownerOnly: true });
  if ("error" in context) return context.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const flow = String(payload.flow ?? "") as ExportFlow;
  const validFlow = ["sales_order", "purchase_order", "invoice", "shipping", "custom"].includes(
    flow,
  );
  if (!validFlow) {
    return NextResponse.json({ error: "Invalid flow" }, { status: 422 });
  }

  const name = String(payload.name ?? "").trim() || fallbackProfileName(flow);
  const rootModel =
    typeof payload.root_model === "string" && payload.root_model.trim()
      ? payload.root_model.trim()
      : flow === "custom"
        ? ""
        : FLOW_MODELS[flow as Exclude<ExportFlow, "custom">].root;
  const lineModel =
    typeof payload.line_model === "string"
      ? payload.line_model.trim() || null
      : flow === "custom"
        ? null
        : FLOW_MODELS[flow as Exclude<ExportFlow, "custom">].line;

  if (!rootModel) {
    return NextResponse.json({ error: "root_model is required for custom flow" }, { status: 422 });
  }

  const db = context.supabase as unknown as {
    from: (table: string) => {
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => any;
    };
  };

  const { data: inserted, error: profileError } = await db
    .from("export_profiles")
    .insert({
      tenant_id: context.tenantId,
      provider: "odoo",
      name,
      flow,
      root_model: rootModel,
      line_model: lineModel,
      active: payload.active !== false,
      settings: payload.settings && typeof payload.settings === "object" ? payload.settings : {},
    })
    .select("id, name, flow, root_model, line_model, active, settings")
    .single();

  if (profileError || !inserted?.id) {
    return NextResponse.json({ error: "Failed to create export profile" }, { status: 500 });
  }

  const mappings = Array.isArray(payload.mappings)
    ? payload.mappings.filter((item) => item && typeof item === "object")
    : defaultMappings(flow);

  if (mappings.length > 0) {
    const rows = mappings
      .map((mapping) => {
        const row = mapping as Record<string, unknown>;
        return {
          tenant_id: context.tenantId,
          export_profile_id: inserted.id,
          scope: row.scope === "line" ? "line" : "header",
          source_path: String(row.source_path ?? "").trim(),
          destination_model: String(row.destination_model ?? "").trim() || rootModel,
          destination_field: String(row.destination_field ?? "").trim(),
          required: row.required === true,
          active: row.active !== false,
          default_value: row.default_value ?? null,
          transform: row.transform && typeof row.transform === "object" ? row.transform : {},
        };
      })
      .filter((row) => row.source_path && row.destination_field);

    if (rows.length > 0) {
      const { error: mappingsError } = await db.from("export_profile_mappings").insert(rows);
      if (mappingsError) {
        return NextResponse.json(
          { error: "Profile created but default mappings failed" },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({ item: inserted });
}
