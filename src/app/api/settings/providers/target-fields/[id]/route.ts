import { NextRequest, NextResponse } from "next/server";
import { cleanText, getTenantContext } from "../../_lib";

const SCOPES = new Set(["header", "line", "partner", "shipping", "billing"]);
const VALUE_TYPES = new Set(["text", "number", "date", "currency", "boolean", "json"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const label = cleanText(body.label);
  const scope = cleanText(body.scope);
  const targetModel = cleanText(body.target_model);
  const targetField = cleanText(body.target_field);
  const valueType = cleanText(body.value_type);

  if ("label" in body) {
    if (!label) return NextResponse.json({ error: "Invalid label" }, { status: 422 });
    patch.label = label;
  }
  if ("scope" in body) {
    if (!SCOPES.has(scope)) return NextResponse.json({ error: "Invalid scope" }, { status: 422 });
    patch.scope = scope;
  }
  if ("target_model" in body) {
    if (!targetModel) return NextResponse.json({ error: "Invalid Odoo model" }, { status: 422 });
    patch.target_model = targetModel;
  }
  if ("target_field" in body) {
    if (!targetField) return NextResponse.json({ error: "Invalid Odoo field" }, { status: 422 });
    patch.target_field = targetField;
  }
  if ("value_type" in body) {
    if (!VALUE_TYPES.has(valueType)) {
      return NextResponse.json({ error: "Invalid value type" }, { status: 422 });
    }
    patch.value_type = valueType;
  }
  if ("required" in body) {
    patch.required = body.required === true;
  }
  if ("active" in body) {
    patch.active = body.active !== false;
  }
  if ("review_profile_id" in body) {
    patch.review_profile_id =
      typeof body.review_profile_id === "string" && body.review_profile_id.length > 0
        ? body.review_profile_id
        : null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No changes provided" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("target_fields")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", context.tenantId)
    .select(
      "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order, review_profile_id",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update target field" }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const { error } = await context.supabase
    .from("target_fields")
    .update({ active: false })
    .eq("id", id)
    .eq("tenant_id", context.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to remove target field" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
