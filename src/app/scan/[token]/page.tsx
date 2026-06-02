// Public capture page — no auth required, but validates the signed token
// first. If the tenant has a PIN configured we gate access behind a 4-digit
// challenge (signed cookie, 12h TTL).
//
// IMPORTANT (Next 16): cookies()/headers() and params are async. Always await.

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";
import { isPinCookieValid, PIN_COOKIE_NAME } from "@/lib/scan-pin-cookie";
import { ScanClient } from "./scan-client";
import { PinGate } from "./pin-gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capturar · DocFlow" };

export default async function ScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyScanToken(token);
  if (!payload) notFound();

  // Is a PIN configured for this tenant?
  const service = createServiceClient();
  const { data: tenant } = await service
    .from("tenants")
    .select("scan_pin_hash")
    .eq("id", payload.tenant_id)
    .maybeSingle();

  const pinRequired = Boolean(
    (tenant as { scan_pin_hash: string | null } | null)?.scan_pin_hash,
  );

  if (pinRequired) {
    const jar = await cookies();
    const cookieValue = jar.get(PIN_COOKIE_NAME)?.value;
    if (!isPinCookieValid(cookieValue, payload.tenant_id)) {
      return <PinGate token={token} />;
    }
  }

  return (
    <ScanClient
      token={token}
      expiresAt={new Date(payload.exp * 1000).toISOString()}
    />
  );
}
