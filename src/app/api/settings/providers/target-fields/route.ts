import { NextRequest, NextResponse } from "next/server";
import { cleanText, getTenantContext } from "../_lib";

const SCOPES = new Set(["header", "line", "partner", "shipping", "billing"]);
const VALUE_TYPES = new Set(["text", "number", "date", "currency", "boolean", "json"]);

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const key = cleanText(body.key)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const label = cleanText(body.label);
  const scope = cleanText(body.scope);
  const targetModel = cleanText(body.target_model);
  const targetField = cleanText(body.target_field);
  const valueType = cleanText(body.value_type) || "text";
  const required = body.required === true;
  const reviewProfileId =
    typeof body.review_profile_id === "string" && body.review_profile_id.length > 0
      ? body.review_profile_id
      : null;

  if (
    !key ||
    !label ||
    !SCOPES.has(scope) ||
    !targetModel ||
    !targetField ||
    !VALUE_TYPES.has(valueType)
  ) {
    return NextResponse.json({ error: "Invalid target field payload" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("target_fields")
    .insert({
      tenant_id: context.tenantId,
      key,
      label,
      scope,
      target_model: targetModel,
      target_field: targetField,
      value_type: valueType,
      required,
      system: false,
      active: true,
      review_profile_id: reviewProfileId,
    })
    .select(
      "id, key, label, scope, target_model, target_field, value_type, required, active, system, sort_order, review_profile_id",
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create target field" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
