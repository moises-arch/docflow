import { NextRequest, NextResponse } from "next/server";
import { cleanOptionalText, cleanText, getTenantContext, parsePositiveInt } from "../_lib";

type SkuRule = {
  type: "strip_prefix" | "strip_suffix" | "strip_separators";
  value?: string;
};

function parseSkuRule(value: unknown): SkuRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.type !== "strip_prefix" &&
    record.type !== "strip_suffix" &&
    record.type !== "strip_separators"
  ) {
    return null;
  }
  const rawValue = typeof record.value === "string" ? record.value.trim().slice(0, 80) : "";
  if ((record.type === "strip_prefix" || record.type === "strip_suffix") && !rawValue) return null;
  return rawValue ? { type: record.type, value: rawValue } : { type: record.type };
}

async function saveSkuRule(params: {
  context: Awaited<ReturnType<typeof getTenantContext>> & { error?: never };
  providerId: string;
  rule: SkuRule | null;
}) {
  const { context, providerId, rule } = params;
  if (!rule) return;

  const { data: provider, error: providerError } = await context.supabase
    .from<{ settings: Record<string, unknown> | null }>("providers")
    .select("settings")
    .eq("tenant_id", context.tenantId)
    .eq("id", providerId)
    .maybeSingle();

  if (providerError) {
    throw new Error("Failed to load provider settings");
  }

  const settings =
    provider?.settings && typeof provider.settings === "object" && !Array.isArray(provider.settings)
      ? provider.settings
      : {};
  const rules = Array.isArray(settings.sku_rules) ? settings.sku_rules : [];
  const signature = JSON.stringify(rule);
  const nextRules = [...rules.filter((item) => JSON.stringify(item) !== signature), rule].slice(
    -25,
  );

  const { error } = await context.supabase
    .from("providers")
    .update({ settings: { ...settings, sku_rules: nextRules } })
    .eq("tenant_id", context.tenantId)
    .eq("id", providerId);

  if (error) {
    throw new Error("Failed to save SKU rule");
  }
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const providerId = cleanText(body.provider_id);
  const sourceSku = cleanOptionalText(body.source_sku);
  const sourceCompanySku = cleanOptionalText(body.source_company_sku);
  const sourceDescription = cleanOptionalText(body.source_description);
  const odooProductId = parsePositiveInt(body.odoo_product_id);
  const odooProductName = cleanText(body.odoo_product_name);
  const odooDefaultCode = cleanOptionalText(body.odoo_default_code);
  const skuRule = parseSkuRule(body.sku_rule);

  if (
    !providerId ||
    (!sourceSku && !sourceCompanySku && !sourceDescription) ||
    !odooProductId ||
    !odooProductName
  ) {
    return NextResponse.json({ error: "Invalid product mapping payload" }, { status: 422 });
  }

  const { data: existing, error: existingError } = await context.supabase
    .from<{ id: string }>("provider_product_mappings")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("provider_id", providerId)
    .eq("odoo_product_id", odooProductId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: "Failed to load product mapping" }, { status: 500 });
  }

  if (existing?.id) {
    const { data, error } = await context.supabase
      .from("provider_product_mappings")
      .update({
        source_sku: sourceSku,
        source_company_sku: sourceCompanySku,
        source_description: sourceDescription,
        odoo_product_name: odooProductName,
        odoo_default_code: odooDefaultCode,
        source: "manual",
        confidence: 1,
      })
      .eq("id", existing.id)
      .eq("tenant_id", context.tenantId)
      .select(
        "id, provider_id, source_sku, source_company_sku, source_description, odoo_product_id, odoo_product_name, odoo_default_code, source, confidence",
      )
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Failed to update product mapping" }, { status: 500 });
    }

    try {
      await saveSkuRule({ context, providerId, rule: skuRule });
    } catch {
      return NextResponse.json({ error: "Failed to save SKU rule" }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  }

  const { data, error } = await context.supabase
    .from("provider_product_mappings")
    .insert({
      tenant_id: context.tenantId,
      provider_id: providerId,
      source_sku: sourceSku,
      source_company_sku: sourceCompanySku,
      source_description: sourceDescription,
      odoo_product_id: odooProductId,
      odoo_product_name: odooProductName,
      odoo_default_code: odooDefaultCode,
      source: "manual",
      confidence: 1,
    })
    .select(
      "id, provider_id, source_sku, source_company_sku, source_description, odoo_product_id, odoo_product_name, odoo_default_code, source, confidence",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create product mapping" }, { status: 500 });
  }

  try {
    await saveSkuRule({ context, providerId, rule: skuRule });
  } catch {
    return NextResponse.json({ error: "Failed to save SKU rule" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
