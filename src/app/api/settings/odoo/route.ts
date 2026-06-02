export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Payload = {
  base_url?: unknown;
  database?: unknown;
  username?: unknown;
  api_key?: unknown;
  export_mode?: unknown;
  test_only?: unknown;
  contact_settings?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
      return null;
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// ─── Test Odoo connectivity from the Next.js server ──────────────────────────
async function testOdooAuth(
  baseUrl: string,
  database: string,
  username: string,
  password: string,
): Promise<{ uid: number }> {
  const res = await fetch(`${baseUrl}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 1,
      params: {
        service: "common",
        method: "authenticate",
        args: [database, username, password, {}],
      },
    }),
  });

  if (!res.ok) throw new Error(`Odoo unreachable (HTTP ${res.status})`);

  const body = (await res.json()) as {
    result?: unknown;
    error?: { data?: { message?: string } };
  };
  if (body.error) throw new Error(body.error.data?.message ?? "Odoo RPC error");

  const uid = body.result;
  if (typeof uid !== "number" || uid === 0) {
    throw new Error("Authentication failed — check credentials");
  }
  return { uid };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const baseUrl = validateBaseUrl(cleanText(payload.base_url));
  const database = cleanText(payload.database);
  const username = cleanText(payload.username);
  const apiKey = cleanText(payload.api_key);
  const exportModeRaw = cleanText(payload.export_mode);
  const exportMode = exportModeRaw === "quotation" ? "quotation" : "sales_order";
  const testOnly = payload.test_only === true;
  const contactSettings =
    payload.contact_settings && typeof payload.contact_settings === "object"
      ? payload.contact_settings
      : undefined;

  if (!baseUrl || !database || !username) {
    return NextResponse.json({ error: "Invalid Odoo connection details" }, { status: 422 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Password / API key is required" }, { status: 422 });
  }

  // ── Test connection ─────────────────────────────────────────────────────
  try {
    await testOdooAuth(baseUrl, database, username, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Connection test failed", detail: msg }, { status: 422 });
  }

  if (testOnly) {
    return NextResponse.json({ ok: true, status: "active" });
  }

  // ── Delegate save + encryption to the Edge Function ─────────────────────
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/save-odoo-connection`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenant_id: membership.tenant_id,
      base_url: baseUrl,
      database,
      username,
      password: apiKey,
      export_mode: exportMode,
      contact_settings: contactSettings,
    }),
  });

  if (!edgeRes.ok) {
    const detail = await edgeRes.text().catch(() => "");
    console.error("[settings/odoo] edge fn error:", edgeRes.status, detail);
    return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "active" });
}
