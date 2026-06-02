/**
 * POST /api/integrations/coming-soon
 *
 * Records a user's interest in a not-yet-shipped integration. Used by the
 * "Notify me when ready" form in src/app/[locale]/integrations/_components/coming-soon.tsx.
 *
 * Auth: requires a session (any tenant member). Records the signup with
 * tenant_id and user_id from the session so product can deduplicate and
 * count interest per tenant.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { integration_id?: unknown; integration_name?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const integrationId =
    typeof body.integration_id === "string" ? body.integration_id.trim().slice(0, 64) : "";
  const integrationName =
    typeof body.integration_name === "string" ? body.integration_name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";

  if (!integrationId || !integrationName || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 422 });
  }

  // Resolve current tenant. Not required for the row, but useful telemetry.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  const service = createServiceClient();
  // Upsert silently dedupes per (integration_id, email).
  const { error } = await service.from("coming_soon_requests").upsert(
    {
      tenant_id: membership?.tenant_id ?? null,
      user_id: user.id,
      integration_id: integrationId,
      integration_name: integrationName,
      email,
      ip,
      user_agent: ua,
    },
    { onConflict: "integration_id,email" },
  );

  if (error) {
    console.error("[coming-soon] upsert failed:", error.message);
    return NextResponse.json({ error: "Failed to save signup" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
