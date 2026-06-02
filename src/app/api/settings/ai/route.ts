import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Payload = {
  provider?: unknown;
  primary_model?: unknown;
  api_key?: unknown;
  test_only?: unknown;
};

const ANTHROPIC_PROVIDER = "anthropic";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }
  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const provider = ANTHROPIC_PROVIDER;
  const primaryModel = ANTHROPIC_MODEL;
  const apiKey = cleanText(payload.api_key);
  const testOnly = payload.test_only === true;

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 422 });
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/save-ai-connection`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenant_id: membership.tenant_id,
      provider,
      primary_model: primaryModel,
      api_key: apiKey,
      test_only: testOnly,
    }),
  });

  const body = (await edgeRes.json().catch(() => ({}))) as { error?: string; detail?: string };

  if (!edgeRes.ok) {
    return NextResponse.json(
      { error: body.error ?? "Failed to save AI config", detail: body.detail ?? null },
      { status: edgeRes.status >= 400 && edgeRes.status < 500 ? edgeRes.status : 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "active" });
}
