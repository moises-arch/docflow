import { cleanText, getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

// Probes IMAP credentials by delegating to the email-imap-admin Edge Function
// (which holds INTAKE_SECRETS_KEY). The body may either include plaintext
// credentials for an unsaved form, or `use_saved: true` to test the stored
// password without re-entering it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContext();
  if ("error" in context) return context.error;
  const { tenantId } = context;

  let body: {
    imap_host?: unknown;
    imap_port?: unknown;
    imap_secure?: unknown;
    imap_username?: unknown;
    imap_password?: unknown;
    imap_mailbox?: unknown;
    use_saved?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/email-imap-admin`;
  const payload: Record<string, unknown> = {
    action: "test",
    tenant_id: tenantId,
    source_id: id,
    imap_host: cleanText(body.imap_host),
    imap_port: Number.isFinite(Number(body.imap_port)) ? Number(body.imap_port) : 993,
    imap_secure: body.imap_secure !== false,
    imap_username: cleanText(body.imap_username),
    imap_password: typeof body.imap_password === "string" ? body.imap_password : "",
    imap_mailbox: cleanText(body.imap_mailbox) || "INBOX",
    use_saved: body.use_saved === true,
  };

  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const result = (await edgeRes.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
  return NextResponse.json(result, { status: edgeRes.status });
}
