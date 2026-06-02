import {
  getTenantContext,
  type DynamicSupabaseClient,
} from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

const BUCKET = "documents";
const SIGN_TTL = 60 * 60; // 1h

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { supabase, tenantId } = ctx;
  const db = supabase as unknown as DynamicSupabaseClient;

  type EmailRow = {
    id: string;
    from_email: string;
    from_name: string | null;
    subject: string | null;
    received_at: string;
    state: string;
    raw_storage_path: string | null;
    html_storage_path: string | null;
    text_storage_path: string | null;
    meta: Record<string, unknown> | null;
  };

  const { data: emailData } = await db
    .from<EmailRow>("inbound_emails")
    .select(
      "id,from_email,from_name,subject,received_at,state,raw_storage_path,html_storage_path,text_storage_path,meta",
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  const email = Array.isArray(emailData) ? emailData[0] : (emailData as EmailRow | null);
  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  type AttachmentRow = {
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    disposition: string | null;
    state: string;
    storage_path: string;
    document_id: string | null;
  };

  const { data: attachmentsData } = await db
    .from<AttachmentRow[]>("inbound_email_attachments")
    .select("id,original_name,mime_type,size_bytes,disposition,state,storage_path,document_id")
    .eq("inbound_email_id", id)
    .eq("tenant_id", tenantId);

  const attachments = (attachmentsData ?? []) as AttachmentRow[];

  // Use service client for signed URLs (storage RLS would otherwise block reads
  // of body files that have no row in `documents` linked back to the user).
  const svc = createServiceClient();

  async function sign(path: string | null): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  const [htmlUrl, textUrl, rawUrl, attachmentUrls] = await Promise.all([
    sign(email.html_storage_path),
    sign(email.text_storage_path),
    sign(email.raw_storage_path),
    Promise.all(attachments.map((a) => sign(a.storage_path))),
  ]);

  const meta = email.meta ?? {};
  const recipients = Array.isArray((meta as { recipients?: unknown }).recipients)
    ? ((meta as { recipients: unknown[] }).recipients as string[])
    : [];
  const adapter =
    typeof (meta as { adapter?: unknown }).adapter === "string"
      ? ((meta as { adapter: string }).adapter as string)
      : null;

  return NextResponse.json({
    id: email.id,
    from_email: email.from_email,
    from_name: email.from_name,
    subject: email.subject,
    received_at: email.received_at,
    state: email.state,
    adapter,
    recipients,
    html_url: htmlUrl,
    text_url: textUrl,
    raw_url: rawUrl,
    attachments: attachments.map((a, i) => ({
      id: a.id,
      original_name: a.original_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      disposition: a.disposition,
      state: a.state,
      document_id: a.document_id,
      download_url: attachmentUrls[i],
    })),
  });
}
