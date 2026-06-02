import { cleanOptionalText, cleanText, getTenantContext } from "@/app/api/settings/providers/_lib";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { supabase, tenantId } = context;
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; portal_url?: unknown; login_url?: unknown; provider_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanText(body.name);
  const portalUrl = normalizeUrl(cleanText(body.portal_url));
  const loginUrl = cleanText(body.login_url) ? normalizeUrl(cleanText(body.login_url)) : null;
  const providerId = cleanOptionalText(body.provider_id);

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 422 });
  if (!portalUrl) return NextResponse.json({ error: "Invalid portal URL" }, { status: 422 });
  if (body.login_url && !loginUrl)
    return NextResponse.json({ error: "Invalid login URL" }, { status: 422 });

  const { data, error } = await supabase
    .from("browser_ingest_connections")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      created_by: user.id,
      name,
      portal_url: portalUrl,
      login_url: loginUrl,
      status: loginUrl ? "needs_attention" : "active",
      settings: { max_downloads: 5 },
    })
    .select(
      "id, tenant_id, provider_id, name, portal_url, login_url, status, last_run_at, last_state, created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message ?? "Create failed" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
