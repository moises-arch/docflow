import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseRequiredProductId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function getTenantContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  }

  return { supabase, tenantId: membership.tenant_id };
}

export async function GET() {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("product_mappings")
    .select("id, match_sku, match_description, odoo_product_id, odoo_product_name, created_at")
    .eq("tenant_id", context.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load product mappings" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  let body: {
    extracted_sku?: unknown;
    extracted_description?: unknown;
    odoo_product_id?: unknown;
    odoo_product_name?: unknown;
  };

  try {
    body = (await req.json()) as {
      extracted_sku?: unknown;
      extracted_description?: unknown;
      odoo_product_id?: unknown;
      odoo_product_name?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const extractedSku = cleanText(body.extracted_sku);
  const extractedDescription = cleanText(body.extracted_description);
  const productName = cleanText(body.odoo_product_name);
  const productId = parseRequiredProductId(body.odoo_product_id);

  if ((!extractedSku && !extractedDescription) || !productName || productId === null) {
    return NextResponse.json({ error: "Invalid product mapping payload" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("product_mappings")
    .insert({
      tenant_id: context.tenantId,
      match_sku: extractedSku || null,
      match_description: extractedDescription || null,
      odoo_product_id: productId,
      odoo_product_name: productName,
      source: "manual",
      confidence: 1,
    })
    .select("id, match_sku, match_description, odoo_product_id, odoo_product_name, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create product mapping" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
