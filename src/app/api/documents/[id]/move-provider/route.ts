// Mueve un documento de un provider a otro (re-asignación de template).
// Útil cuando un provider fue creado mal (ej. usando filename como nombre)
// y necesitamos pasar sus documentos al provider correcto.
//
// PATCH /api/documents/:id/move-provider  { target_provider_id: string }
// Actualiza documents.provider_id Y order_drafts.provider_id en la misma transacción.

import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  let body: { target_provider_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const targetProviderId =
    typeof body.target_provider_id === "string" ? body.target_provider_id.trim() : null;
  if (!targetProviderId) {
    return NextResponse.json({ error: "target_provider_id requerido" }, { status: 422 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  // Validar que el documento existe en este tenant
  const { data: doc } = await service
    .from<{ id: string; tenant_id: string; provider_id: string | null }>("documents")
    .select("id, tenant_id, provider_id")
    .eq("id", documentId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Validar que el provider destino existe y pertenece al tenant
  const { data: target } = await service
    .from<{ id: string; name: string; code: string }>("providers")
    .select("id, name, code")
    .eq("id", targetProviderId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Provider destino no encontrado" }, { status: 404 });
  }

  if (doc.provider_id === targetProviderId) {
    return NextResponse.json({ ok: true, no_change: true, provider_id: targetProviderId });
  }

  // Actualizar documents y order_drafts en paralelo
  const [{ error: docError }, { error: draftError }] = await Promise.all([
    service
      .from("documents")
      .update({ provider_id: targetProviderId })
      .eq("id", documentId)
      .eq("tenant_id", membership.tenant_id),
    service
      .from("order_drafts")
      .update({ provider_id: targetProviderId })
      .eq("document_id", documentId)
      .eq("tenant_id", membership.tenant_id),
  ]);

  if (docError) {
    return NextResponse.json({ error: docError.message ?? "document update failed" }, { status: 500 });
  }
  if (draftError) {
    // No critical — el documento sí se movió. Solo log.
    console.warn("[move-provider] order_drafts update failed:", draftError);
  }

  return NextResponse.json({
    ok: true,
    provider_id: target.id,
    provider_name: target.name,
    provider_code: target.code,
    from_provider_id: doc.provider_id,
  });
}
