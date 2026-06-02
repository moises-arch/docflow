// POST /api/inbound-emails/:id/reprocess
// Re-envía un email al pipeline de AI. Dos estrategias:
//   1. Si tiene documentos vinculados (adjuntos PDF procesados) →
//      resetea los que fallaron a "uploaded" y llama ingest
//   2. Si tiene html_storage_path → crea un nuevo documento desde el HTML
//      y llama ingest (útil cuando el email entró pero no generó documentos)

import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: emailId } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  const svc = createServiceClient();

  // Cargar el email
  const { data: email } = await svc
    .from("inbound_emails")
    .select("id, tenant_id, state, html_storage_path, meta, ingest_source_id")
    .eq("id", emailId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  // Cargar documentos vinculados al email (via adjuntos)
  const { data: attachments } = await svc
    .from("inbound_email_attachments")
    .select("id, document_id, state, original_name")
    .eq("inbound_email_id", emailId)
    .eq("tenant_id", tenantId)
    .not("document_id", "is", null);

  const docIds = (attachments ?? [])
    .map((a: { document_id: string | null }) => a.document_id)
    .filter((id): id is string => Boolean(id));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  async function invokeIngest(docId: string) {
    const res = await fetch(`${supabaseUrl}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ document_id: docId, tenant_id: tenantId }),
    });
    return res.ok;
  }

  let reprocessed = 0;

  // Estrategia 1: re-ingest documentos existentes que fallaron
  if (docIds.length > 0) {
    // Resetear docs en failed_processing a uploaded
    await svc
      .from("documents")
      .update({ state: "uploaded", last_error: null })
      .in("id", docIds)
      .eq("tenant_id", tenantId)
      .in("state", ["failed_processing", "uploaded", "needs_review"] as string[]);

    for (const docId of docIds) {
      const ok = await invokeIngest(docId);
      if (ok) reprocessed++;
    }
  }

  // Estrategia 2: si no hay docs y hay HTML, crear nuevo documento desde el HTML
  if (reprocessed === 0 && email.html_storage_path) {
    const { data: fileData } = await svc.storage
      .from("documents")
      .download(email.html_storage_path as string);

    if (fileData) {
      const content = await fileData.text();
      const docId = crypto.randomUUID();
      const ts = new Date().toISOString().slice(0, 7);
      const storagePath = `${tenantId}/email/${ts}/${docId}/reprocess-body.html`;

      const { error: uploadErr } = await svc.storage
        .from("documents")
        .upload(storagePath, content, { contentType: "text/html", upsert: true });

      if (!uploadErr) {
        const { error: docErr } = await (svc as unknown as { from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: unknown }> } }).from("documents").insert({
          id: docId,
          tenant_id: tenantId,
          original_name: `reprocess-${emailId.slice(0, 8)}.html`,
          storage_path: storagePath,
          mime_type: "text/html",
          size_bytes: content.length,
          state: "uploaded",
          source_channel: "email",
          source_ref: emailId,
          source_meta: {
            inbound_email_id: emailId,
            adapter: (email.meta as Record<string, unknown>)?.adapter ?? "microsoft_graph",
            reprocessed: true,
            reprocessed_at: new Date().toISOString(),
          },
        });

        if (!docErr) {
          const ok = await invokeIngest(docId);
          if (ok) reprocessed++;
        }
      }
    }
  }

  // Actualizar estado del email
  await svc
    .from("inbound_emails")
    .update({ state: reprocessed > 0 ? "processing" : "failed" })
    .eq("id", emailId)
    .eq("tenant_id", tenantId);

  return NextResponse.json({ ok: reprocessed > 0, reprocessed, docIds });
}
