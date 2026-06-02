import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePartnerId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function getTenantContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  }

  return { supabase, tenantId: membership.tenant_id };
}

export async function GET() {
  const context = await getTenantContext();
  if ("error" in context) {
    return context.error;
  }

  const { data, error } = await context.supabase
    .from("customer_mappings")
    .select("id, match_key, odoo_partner_name, odoo_partner_id, created_at")
    .eq("tenant_id", context.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load customer mappings" }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const context = await getTenantContext();
  if ("error" in context) {
    return context.error;
  }

  let body: { extracted_name?: unknown; odoo_partner_name?: unknown; odoo_partner_id?: unknown };
  try {
    body = (await req.json()) as {
      extracted_name?: unknown;
      odoo_partner_name?: unknown;
      odoo_partner_id?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const extractedName = cleanText(body.extracted_name);
  const partnerName = cleanText(body.odoo_partner_name);
  const partnerId = parsePartnerId(body.odoo_partner_id);

  if (!extractedName || !partnerName) {
    return NextResponse.json({ error: "Invalid customer mapping payload" }, { status: 422 });
  }

  const { data, error } = await context.supabase
    .from("customer_mappings")
    .insert({
      tenant_id: context.tenantId,
      match_key: extractedName,
      odoo_partner_name: partnerName,
      odoo_partner_id: partnerId ?? 0,
      source: "manual",
      confidence: 1,
    })
    .select("id, match_key, odoo_partner_name, odoo_partner_id, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create customer mapping" }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
