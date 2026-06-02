import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signScanToken } from "@/lib/scan-token";

export const dynamic = "force-dynamic";

const TTL_DAYS = 365; // QR fijo — 1 año, rota manualmente si se compromete

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
  if (!membership?.tenant_id)
    return NextResponse.json({ error: "no tenant" }, { status: 403 });

  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;
  const token = signScanToken({ tenant_id: membership.tenant_id, user_id: user.id, exp });

  const origin = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");

  return NextResponse.json({
    token,
    url: `${origin}/scan/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
}
