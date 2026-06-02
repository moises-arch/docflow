import { NextRequest, NextResponse } from "next/server";
import { cleanOptionalText, cleanText, getTenantContext } from "../_lib";

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
  const targetFieldId = cleanText(body.target_field_id);
  const sourceFieldKey = cleanText(body.source_field_key);
  const sourceFieldLabel = cleanOptionalText(body.source_field_label);

  if (!providerId || !targetFieldId || !sourceFieldKey) {
    return NextResponse.json({ error: "Invalid field mapping payload" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("provider_field_mappings")
    .upsert(
      {
        tenant_id: context.tenantId,
        provider_id: providerId,
        target_field_id: targetFieldId,
        source_field_key: sourceFieldKey,
        source_field_label: sourceFieldLabel,
        active: true,
      },
      { onConflict: "provider_id,target_field_id" },
    )
    .select("id, provider_id, target_field_id, source_field_key, source_field_label, active")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create field mapping" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
