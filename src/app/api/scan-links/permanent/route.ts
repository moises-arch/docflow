// Mints a long-lived scan token meant for printed QRs. Same payload shape as
// the 365-day token but with a ~100 year TTL so the QR can be printed and
// distributed to all employees without rotating annually.
//
// The QR still binds uploads to the user who minted it (uploaded_by =
// payload.user_id) — typically an admin "kiosk" user. If that user is
// deactivated, generate a new permanent QR from another active admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signScanToken } from "@/lib/scan-token";

export const dynamic = "force-dynamic";

// 100 years in seconds. Anything past ~year 2099 is effectively permanent
// from a business perspective. We intentionally don't use Number.MAX_SAFE
// because the payload is JSON.stringified into the token; smaller is better.
const TTL_SECONDS = 100 * 365 * 24 * 60 * 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "no tenant" }, { status: 403 });
  }

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = signScanToken({
    tenant_id: membership.tenant_id,
    user_id: user.id,
    exp,
  });

  const origin = (
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  ).replace(/\/$/, "");

  return NextResponse.json({
    token,
    url: `${origin}/scan/${token}`,
    printUrl: `${origin}/scan-print/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    permanent: true,
  });
}
