// Admin endpoint to configure or clear the tenant's QR scan PIN.
// GET   → returns { hasPin: boolean, updatedAt: string | null }
// POST  → body { pin: string } (4 dígitos) → sets hash + salt
// DELETE → clears PIN (disables PIN gate)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hashScanPin } from "@/lib/scan-pin";

export const dynamic = "force-dynamic";

async function loadTenantId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) return { error: "no_tenant" as const, status: 403 };
  return { tenantId: membership.tenant_id, userId: user.id };
}

export async function GET() {
  const ctx = await loadTenantId();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const service = createServiceClient();
  const { data } = await service
    .from("tenants")
    .select("scan_pin_hash, scan_pin_updated_at")
    .eq("id", ctx.tenantId)
    .maybeSingle();

  const row = data as { scan_pin_hash: string | null; scan_pin_updated_at: string | null } | null;
  return NextResponse.json({
    hasPin: Boolean(row?.scan_pin_hash),
    updatedAt: row?.scan_pin_updated_at ?? null,
  });
}

export async function POST(req: Request) {
  const ctx = await loadTenantId();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = (await req.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "invalid_pin", detail: "PIN debe tener exactamente 4 dígitos" },
      { status: 422 },
    );
  }

  const { hash, salt } = hashScanPin(pin);
  const service = createServiceClient();
  const { error } = await service
    .from("tenants")
    .update({
      scan_pin_hash: hash,
      scan_pin_salt: salt,
      scan_pin_updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId);

  if (error) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const ctx = await loadTenantId();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const service = createServiceClient();
  await service
    .from("tenants")
    .update({
      scan_pin_hash: null,
      scan_pin_salt: null,
      scan_pin_updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.tenantId);

  return NextResponse.json({ ok: true });
}
