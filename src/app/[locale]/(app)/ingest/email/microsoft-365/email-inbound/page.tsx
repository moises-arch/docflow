import { requireSettingsAccess } from "../../../../settings/_lib";
import {
  EmailInboundClient,
  type EmailListItem,
} from "@/app/[locale]/(app)/integrations/email-inbound/email-inbound-client";

export const dynamic = "force-dynamic";

export default async function M365EmailInboundPage() {
  const { supabase, tenantId } = await requireSettingsAccess();

  const { data: rows } = await supabase
    .from("inbound_emails")
    .select(
      "id, subject, from_email, from_name, received_at, state, html_storage_path, text_storage_path, ingest_source_id, meta",
    )
    .eq("tenant_id", tenantId)
    .eq("meta->>adapter", "microsoft_graph")
    .order("received_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    subject: string | null;
    from_email: string;
    from_name: string | null;
    received_at: string;
    state: string;
    html_storage_path: string | null;
    text_storage_path: string | null;
    ingest_source_id: string | null;
    meta: Record<string, unknown> | null;
  };

  const items: EmailListItem[] = ((rows ?? []) as Row[]).map((r) => ({
    id: r.id,
    subject: r.subject,
    fromEmail: r.from_email,
    fromName: r.from_name,
    receivedAt: r.received_at,
    state: r.state,
    adapter:
      r.meta && typeof (r.meta as Record<string, unknown>).adapter === "string"
        ? ((r.meta as Record<string, unknown>).adapter as string)
        : null,
    hasHtml: Boolean(r.html_storage_path),
    hasText: Boolean(r.text_storage_path),
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <EmailInboundClient items={items} />
    </div>
  );
}
