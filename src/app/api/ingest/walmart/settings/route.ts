// PATCH endpoint to update Walmart settings (toggles in dashboard).

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { getWalmartSettings, updateWalmartSettings } from "@/lib/walmart/settings";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const settings = await getWalmartSettings(ctx.tenantId);
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  let body: { ai_fallback_enabled?: boolean; auto_acknowledge?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: Parameters<typeof updateWalmartSettings>[1] = {};
  if (typeof body.ai_fallback_enabled === "boolean") {
    patch.ai_fallback_enabled = body.ai_fallback_enabled;
  }
  if (typeof body.auto_acknowledge === "boolean") {
    patch.auto_acknowledge = body.auto_acknowledge;
  }

  const updated = await updateWalmartSettings(tenantId, patch);
  return NextResponse.json(updated);
}
