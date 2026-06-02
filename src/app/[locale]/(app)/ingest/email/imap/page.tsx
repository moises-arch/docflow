import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { Link } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../../settings/_lib";
import { EmailMethodToolbar } from "../_components/email-method-toolbar";
import { EmailImapClient, type ImapSource } from "./email-imap-client";

export default async function ImapEmailIngestPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("ingestHub.emailIngest");
  const db = supabase as unknown as DynamicSupabaseClient;

  const [{ data: rawSources }, { data: providers }] = await Promise.all([
    db
      .from<
        Array<{
          id: string;
          provider_id: string | null;
          address: string;
          status: "active" | "paused" | "archived";
          allowed_senders: string[];
          settings: Record<string, unknown> | null;
          created_at: string;
        }>
      >("email_ingest_sources")
      .select("id, provider_id, address, status, allowed_senders, settings, created_at")
      .eq("tenant_id", tenantId)
      .eq("settings->>adapter", "imap")
      .not("status", "eq", "archived")
      .order("created_at", { ascending: false }),
    db
      .from<Array<{ id: string; name: string }>>("providers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
  ]);

  // Strip the encrypted password before sending to the client.
  const sources: ImapSource[] = (rawSources ?? []).map((row) => {
    const s = (row.settings ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      provider_id: row.provider_id,
      address: row.address,
      status: row.status,
      allowed_senders: row.allowed_senders ?? [],
      created_at: row.created_at,
      imap_host: typeof s.imap_host === "string" ? (s.imap_host as string) : "",
      imap_port: typeof s.imap_port === "number" ? (s.imap_port as number) : 993,
      imap_secure: s.imap_secure !== false,
      imap_username: typeof s.imap_username === "string" ? (s.imap_username as string) : "",
      imap_mailbox: typeof s.imap_mailbox === "string" ? (s.imap_mailbox as string) : "INBOX",
      imap_mark_seen: s.imap_mark_seen !== false,
      imap_last_synced_at:
        typeof s.imap_last_synced_at === "string" ? (s.imap_last_synced_at as string) : null,
      has_password: typeof s.imap_password_enc === "string" && s.imap_password_enc.length > 0,
    };
  });

  return (
    <main className="h-full overflow-y-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-6xl gap-5">
          <header>
            <Link
              href="/ingest"
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              {t("backToHub")}
            </Link>
            <h1 className="text-xl font-semibold text-[var(--color-fg)]">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-mute)]">{t("description")}</p>
          </header>

          <EmailMethodToolbar active="imap" />

          <EmailImapClient sources={sources} providers={providers ?? []} />
        </div>
      </main>
  );
}
