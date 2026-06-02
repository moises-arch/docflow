// PATCH /api/settings/providers/:id/email-ingest
// Actualiza solo providers.settings.email_ingest sin tocar el resto de settings
// (learned_defaults, aliases, etc.) usando jsonb merge (||).

import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

export type EmailIngestConfig = {
  process_html_body: boolean;
  packing_slip_filename_patterns: string[];
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { id: providerId } = await params;

  let body: Partial<EmailIngestConfig>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Validar
  if (typeof body.process_html_body !== "boolean") {
    return NextResponse.json({ error: "process_html_body must be boolean" }, { status: 422 });
  }
  if (!Array.isArray(body.packing_slip_filename_patterns)) {
    return NextResponse.json({ error: "packing_slip_filename_patterns must be array" }, { status: 422 });
  }

  const emailIngest: EmailIngestConfig = {
    process_html_body: body.process_html_body,
    packing_slip_filename_patterns: body.packing_slip_filename_patterns
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim().toLowerCase()),
  };

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  // Hacer merge en la BD usando jsonb || para no pisar otros settings
  // Supabase JS no soporta jsonb_set nativo, así que cargamos y re-guardamos
  const { data: current } = await service
    .from<{ settings: Record<string, unknown> | null }>("providers")
    .select("settings")
    .eq("id", providerId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const merged = {
    ...(current.settings ?? {}),
    email_ingest: emailIngest,
  };

  const { error } = await service
    .from("providers")
    .update({ settings: merged })
    .eq("id", providerId)
    .eq("tenant_id", context.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_ingest: emailIngest });
}
