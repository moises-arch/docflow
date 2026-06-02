// Mobile-side PIN verification. Token-scoped so we know the tenant before
// asking for the PIN. On success sets a short-lived signed cookie that the
// scan page reads to bypass the PIN gate.
//
// Rate-limited at 10 attempts / hour / tenant to mitigate brute force of the
// 4-digit space.

import { NextRequest, NextResponse } from "next/server";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyScanPin } from "@/lib/scan-pin";
import { checkAndConsume, rateLimitResponse } from "@/lib/rate-limit";
import {
  PIN_COOKIE_NAME,
  PIN_COOKIE_TTL_SECONDS,
  signPinCookie,
} from "@/lib/scan-pin-cookie";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyScanToken(token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const rl = await checkAndConsume({
    tenantId: payload.tenant_id,
    key: "scan-pin",
    capacity: 10,
    refillPerHour: 10,
  });
  const rlResp = rateLimitResponse(rl);
  if (rlResp) return rlResp;

  const body = (await req.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin?.trim() ?? "";
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json(
      { error: "invalid_pin", detail: "Ingresá los 4 dígitos" },
      { status: 422 },
    );
  }

  const service = createServiceClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("scan_pin_hash, scan_pin_salt")
    .eq("id", payload.tenant_id)
    .maybeSingle();

  const row = tenant as {
    scan_pin_hash: string | null;
    scan_pin_salt: string | null;
  } | null;

  if (!row?.scan_pin_hash || !row?.scan_pin_salt) {
    return buildSuccessResponse(payload.tenant_id);
  }

  if (!verifyScanPin(pin, row.scan_pin_hash, row.scan_pin_salt)) {
    return NextResponse.json(
      { error: "wrong_pin", detail: "PIN incorrecto" },
      { status: 401 },
    );
  }

  return buildSuccessResponse(payload.tenant_id);
}

function buildSuccessResponse(tenantId: string) {
  const exp = Math.floor(Date.now() / 1000) + PIN_COOKIE_TTL_SECONDS;
  const cookieValue = signPinCookie(tenantId, exp);
  const res = NextResponse.json({ ok: true, expiresIn: PIN_COOKIE_TTL_SECONDS });
  res.cookies.set(PIN_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/scan",
    maxAge: PIN_COOKIE_TTL_SECONDS,
  });
  return res;
}
