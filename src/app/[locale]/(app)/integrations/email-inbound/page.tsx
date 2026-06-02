// Email Inbound — read-only historical viewer of all emails received by
// orders@example.com via Email provider Graph. NOT linked to any other
// DocFlow functionality (no triggers, no actions). Pure historical archive.
import { requireSettingsAccess } from "../../settings/_lib";
import { Inbox } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmailInboundClient, type EmailListItem } from "./email-inbound-client";

export const dynamic = "force-dynamic";

export default async function EmailInboundPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("emailInbound");

  // Pull recent inbound emails — last 200 across all sources for this tenant.
  // Read-only: no action endpoints, no auto-link to drafts, no reprocessing.
  const { data: rows } = await supabase
    .from("inbound_emails")
    .select(
      "id, subject, from_email, from_name, received_at, state, html_storage_path, text_storage_path, ingest_source_id, meta",
    )
    .eq("tenant_id", tenantId)
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

  const items: EmailListItem[] = ((rows ?? []) as Row[]).map((r) => {
    const adapter =
      r.meta && typeof (r.meta as Record<string, unknown>).adapter === "string"
        ? ((r.meta as Record<string, unknown>).adapter as string)
        : null;
    return {
      id: r.id,
      subject: r.subject,
      fromEmail: r.from_email,
      fromName: r.from_name,
      receivedAt: r.received_at,
      state: r.state,
      adapter,
      hasHtml: Boolean(r.html_storage_path),
      hasText: Boolean(r.text_storage_path),
    };
  });

  return (
    <main className="flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Inbox size={18} />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">{t("title")}</h1>
          <p className="truncate text-[11px] text-[var(--color-fg-mute)]">
            {t("subtitle")}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <EmailInboundClient items={items} />
      </div>
    </main>
  );
}
