import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, type DynamicSupabaseClient } from "../_lib";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const { id } = await params;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Only allow patching safe fields
  const allowed: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) allowed.name = body.name.trim().slice(0, 120);
  if (typeof body.default_currency === "string") allowed.default_currency = body.default_currency.trim().toUpperCase().slice(0, 3) || null;
  if (Array.isArray(body.email_domains)) {
    allowed.email_domains = body.email_domains
      .filter((d): d is string => typeof d === "string")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof body.status === "string" && ["active", "paused", "archived"].includes(body.status)) {
    allowed.status = body.status;
  }
  if (body.settings !== undefined && typeof body.settings === "object" && body.settings !== null) {
    allowed.settings = body.settings;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;
  const { data, error } = await service
    .from("providers")
    .update(allowed)
    .eq("id", id)
    .eq("tenant_id", context.tenantId)
    .select("id, name, code, default_currency, email_domains, settings, status")
    .single();

  if (error) {
    return NextResponse.json({ error: "Update failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, provider: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const { id } = await params;

  const { data: provider } = await context.supabase
    .from<{ id: string }>("providers")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;
  const { error } = await service
    .from("providers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", context.tenantId);

  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
