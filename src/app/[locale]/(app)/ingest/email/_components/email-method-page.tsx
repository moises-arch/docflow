import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { Link } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../../settings/_lib";
import { EmailIngestClient } from "../../email-ingest-client";
import { EmailMethodToolbar } from "./email-method-toolbar";

type Method = "microsoft-365";
type Adapter = "microsoft_graph";

const ADAPTER_BY_METHOD: Record<Method, Adapter> = {
  "microsoft-365": "microsoft_graph",
};

export async function EmailMethodPage({ method }: { method: Method }) {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("ingestHub.emailIngest");
  const db = supabase as unknown as DynamicSupabaseClient;
  const adapter = ADAPTER_BY_METHOD[method];

  const [{ data: emailSources }, { data: providers }, { data: inboundEmails }] = await Promise.all([
    db
      .from<
        Array<{
          id: string;
          provider_id: string | null;
          address: string;
          status: "active" | "paused" | "archived";
          allowed_senders: string[];
          settings: {
            adapter?: string;
            webhook_secret?: string;
            graph_client_state?: string;
            graph_mailbox_id?: string;
            graph_folder_id?: string;
            graph_subscription_id?: string;
          } | null;
          created_at: string;
        }>
      >("email_ingest_sources")
      .select("id, provider_id, address, status, allowed_senders, settings, created_at")
      .eq("tenant_id", tenantId)
      .eq("settings->>adapter", adapter)
      .not("status", "eq", "archived")
      .order("created_at", { ascending: false }),
    db
      .from<Array<{ id: string; name: string }>>("providers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    db
      .from<
        Array<{
          id: string;
          provider_id: string | null;
          from_email: string;
          subject: string | null;
          state: string;
          received_at: string;
          meta: {
            adapter?: string;
            recipients?: string[];
            provider_detection?: { reason?: string; confidence?: number };
          } | null;
        }>
      >("inbound_emails")
      .select("id, provider_id, from_email, subject, state, received_at, meta")
      .eq("tenant_id", tenantId)
      .eq("meta->>adapter", adapter)
      .order("received_at", { ascending: false })
      .limit(20),
  ]);

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/email-ingest`;

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

          <EmailMethodToolbar active={method} />

          <EmailIngestClient
            method={adapter}
            webhookUrl={webhookUrl}
            emailSources={emailSources ?? []}
            inboundEmails={inboundEmails ?? []}
            providers={providers ?? []}
          />
        </div>
      </main>
  );
}
