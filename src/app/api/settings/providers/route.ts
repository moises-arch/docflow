import { NextRequest, NextResponse } from "next/server";
import { cleanOptionalText, cleanText, getTenantContext } from "./_lib";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  let body: {
    name?: unknown;
    code?: unknown;
    default_currency?: unknown;
    email_domains?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = cleanText(body.name);
  const code = slugify(cleanText(body.code) || name);
  const defaultCurrency =
    cleanOptionalText(body.default_currency)?.toUpperCase().slice(0, 3) ?? null;
  const emailDomains = Array.isArray(body.email_domains)
    ? body.email_domains.map(cleanText).filter(Boolean)
    : [];

  if (!name || !code) {
    return NextResponse.json({ error: "Invalid provider payload" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("providers")
    .insert({
      tenant_id: context.tenantId,
      name,
      code,
      default_currency: defaultCurrency,
      email_domains: emailDomains,
    })
    .select("id, name, code, status, default_currency, email_domains, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}

// GET /api/settings/providers — lista todos los providers del tenant.
// Usado por el selector de "Mover documento a otro template".
export async function GET() {
  const context = await getTenantContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("providers")
    .select("id, name, code, status, default_currency, email_domains")
    .eq("tenant_id", context.tenantId)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
