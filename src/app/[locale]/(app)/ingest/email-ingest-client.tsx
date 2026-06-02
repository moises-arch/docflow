"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, Copy, Loader2, Mail, PauseCircle, Plus, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

type ProviderOption = {
  id: string;
  name: string;
};

type EmailSource = {
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
};

type InboundEmail = {
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
};

type Props = {
  method: "mailgun" | "microsoft_graph";
  webhookUrl: string;
  emailSources: EmailSource[];
  inboundEmails: InboundEmail[];
  providers: ProviderOption[];
};

export function EmailIngestClient({
  method,
  webhookUrl,
  emailSources,
  inboundEmails,
  providers,
}: Props) {
  const router = useRouter();
  const t = useTranslations("ingestHub.emailIngest");
  const [creating, setCreating] = useState(false);
  const [subscribingSourceId, setSubscribingSourceId] = useState<string | null>(null);
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider.name])),
    [providers],
  );
  const firstSource = emailSources[0];
  const placeholderWebhook = `${webhookUrl}?adapter=${method}&secret=YOUR_SOURCE_SECRET`;
  const methodWebhook = firstSource
    ? emailSourceWebhookUrl(webhookUrl, firstSource)
    : placeholderWebhook;

  async function createSource(formData: FormData) {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch("/api/ingest/email-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: formData.get("address"),
          provider_id: formData.get("provider_id") || null,
          allowed_senders: formData.get("allowed_senders"),
          adapter: method,
          graph_tenant_id: formData.get("graph_tenant_id"),
          graph_client_id: formData.get("graph_client_id"),
          graph_mailbox_id: formData.get("graph_mailbox_id"),
          graph_folder_id: formData.get("graph_folder_id"),
        }),
      });
      if (!response.ok) throw new Error("create_failed");
      toast.success(t("created"));
      router.refresh();
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(id: string, status: "active" | "paused" | "archived") {
    try {
      const response = await fetch(`/api/ingest/email-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("update_failed");
      toast.success(t("updated"));
      router.refresh();
    } catch {
      toast.error(t("updateFailed"));
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(t("copied"));
  }

  async function subscribeMicrosoftGraph(sourceId: string) {
    if (subscribingSourceId) return;
    setSubscribingSourceId(sourceId);
    try {
      const response = await fetch("/api/ingest/microsoft-graph/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (!response.ok) throw new Error("subscribe_failed");
      toast.success(t("subscribed"));
      router.refresh();
    } catch {
      toast.error(t("subscribeFailed"));
    } finally {
      setSubscribingSourceId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
              {method === "mailgun" ? t("mailgunBadge") : t("microsoftBadge")}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--color-fg)]">
              {method === "mailgun" ? t("mailgunTitle") : t("microsoftTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-[var(--color-fg-mute)]">
              {method === "mailgun" ? t("mailgunDescription") : t("microsoftDescription")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={method === "mailgun" ? "default" : "secondary"}
            onClick={() => copyText(methodWebhook)}
          >
            <Copy size={13} aria-hidden="true" />
            {t("copyWebhook")}
          </Button>
        </div>
        <div className="grid overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
          {method === "mailgun" ? (
            <>
              <SetupRow label={t("mailgunStepDomain")} value={t("mailgunStepDomainText")} />
              <SetupRow
                label={t("mailgunExpression")}
                value='match_recipient(".*@your-domain.com")'
                copyLabel={t("copy")}
                onCopy={() => copyText('match_recipient(".*@your-domain.com")')}
              />
              <SetupRow label={t("mailgunAction")} value="forward()" />
              <SetupRow
                label={t("webhookUrl")}
                value={methodWebhook}
                copyLabel={t("copy")}
                onCopy={() => copyText(methodWebhook)}
              />
            </>
          ) : (
            <>
              <SetupRow label={t("microsoftApp")} value={t("microsoftAppText")} />
              <SetupRow label={t("microsoftPermissions")} value="Mail.Read, offline_access" />
              <SetupRow
                label={t("microsoftSubscription")}
                value="/users/{mailbox}/mailFolders/{folder}/messages"
              />
              <SetupRow
                label={t("webhookUrl")}
                value={methodWebhook}
                copyLabel={t("copy")}
                onCopy={() => copyText(methodWebhook)}
              />
              <SetupRow
                label="clientState"
                value={firstSource?.settings?.graph_client_state ?? "CREATED_AFTER_SOURCE_SAVE"}
                copyLabel={t("copy")}
                onCopy={() =>
                  copyText(firstSource?.settings?.graph_client_state ?? "CREATED_AFTER_SOURCE_SAVE")
                }
              />
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">{t("newSource")}</h2>
        </div>
        <form
          action={createSource}
          className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px_minmax(220px,1fr)_auto] md:items-end"
        >
          <input type="hidden" name="adapter" value={method} />
          <Field label={t("address")}>
            <input
              name="address"
              required
              placeholder="orders@intake.example.com"
              className={inputClassName}
            />
          </Field>
          <Field label={t("provider")}>
            <select name="provider_id" className={inputClassName} defaultValue="">
              <option value="">{t("autoDetect")}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("allowedSenders")}>
            <input name="allowed_senders" placeholder="*@walmart.com" className={inputClassName} />
          </Field>
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            {t("create")}
          </Button>
          {method === "microsoft_graph" ? (
            <div className="grid gap-2 md:col-span-4 md:grid-cols-4">
              <Field label={t("graphTenantId")}>
                <input name="graph_tenant_id" placeholder="Tenant ID" className={inputClassName} />
              </Field>
              <Field label={t("graphClientId")}>
                <input
                  name="graph_client_id"
                  placeholder="Application client ID"
                  className={inputClassName}
                />
              </Field>
              <Field label={t("graphMailbox")}>
                <input
                  name="graph_mailbox_id"
                  placeholder="orders@company.com"
                  className={inputClassName}
                />
              </Field>
              <Field label={t("graphFolder")}>
                <input name="graph_folder_id" placeholder="Inbox" className={inputClassName} />
              </Field>
            </div>
          ) : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">{t("sources")}</h2>
          <span className="text-xs text-[var(--color-fg-subtle)]">{emailSources.length}</span>
        </div>
        {emailSources.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-fg-mute)]">
            {t("emptySources")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1160px]">
              <div className="grid h-8 grid-cols-[260px_150px_120px_minmax(180px,1fr)_220px_160px] items-center border-b border-[var(--color-border)] bg-[var(--color-surface-mute)] px-3 text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
                <span>{t("address")}</span>
                <span>{t("provider")}</span>
                <span>{t("adapter")}</span>
                <span>{t("allowedSenders")}</span>
                <span>{t("webhookUrl")}</span>
                <span className="text-right">{t("status")}</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {emailSources.map((source) => (
                  <div
                    key={source.id}
                    className="grid h-11 grid-cols-[260px_150px_120px_minmax(180px,1fr)_220px_160px] items-center gap-3 px-3 hover:bg-[var(--color-surface-mute)]"
                  >
                    <span className="truncate font-mono text-xs font-semibold text-[var(--color-fg)]">
                      {source.address}
                    </span>
                    <span className="truncate text-sm text-[var(--color-fg-mute)]">
                      {source.provider_id ? providerById.get(source.provider_id) : t("autoDetect")}
                    </span>
                    <span className="truncate text-xs text-[var(--color-fg-mute)]">
                      {source.settings?.adapter ?? "mailgun"}
                    </span>
                    <span className="truncate text-xs text-[var(--color-fg-mute)]">
                      {source.allowed_senders.join(", ") || t("anySender")}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => copyText(emailSourceWebhookUrl(webhookUrl, source))}
                        className="h-7 px-2 text-xs"
                      >
                        <Copy size={12} aria-hidden="true" />
                        {t("copy")}
                      </Button>
                      {source.settings?.adapter === "microsoft_graph" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={source.settings.graph_subscription_id ? "ghost" : "secondary"}
                          disabled={subscribingSourceId === source.id}
                          onClick={() => subscribeMicrosoftGraph(source.id)}
                          className="h-7 px-2 text-xs"
                        >
                          {subscribingSourceId === source.id && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          {source.settings.graph_subscription_id ? t("renew") : t("connect")}
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <SourceStatus status={source.status} />
                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(source.id, source.status === "active" ? "paused" : "active")
                        }
                        className="text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
                      >
                        {source.status === "active" ? t("pause") : t("activate")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">{t("recent")}</h2>
          <span className="text-xs text-[var(--color-fg-subtle)]">{inboundEmails.length}</span>
        </div>
        {inboundEmails.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-fg-mute)]">
            {t("emptyRecent")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid h-8 grid-cols-[190px_minmax(260px,1fr)_130px_160px_130px] items-center border-b border-[var(--color-border)] bg-[var(--color-surface-mute)] px-3 text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
                <span>{t("from")}</span>
                <span>{t("subject")}</span>
                <span>{t("state")}</span>
                <span>{t("provider")}</span>
                <span className="text-right">{t("received")}</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {inboundEmails.map((email) => (
                  <div
                    key={email.id}
                    className="grid h-11 grid-cols-[190px_minmax(260px,1fr)_130px_160px_130px] items-center gap-3 px-3 hover:bg-[var(--color-surface-mute)]"
                  >
                    <span className="truncate text-xs text-[var(--color-fg-mute)]">
                      {email.from_email}
                    </span>
                    <span className="truncate text-sm text-[var(--color-fg)]">
                      {email.subject || "-"}
                    </span>
                    <span className="truncate text-xs font-medium text-[var(--color-fg-mute)]">
                      {email.state}
                    </span>
                    <span className="truncate text-xs text-[var(--color-fg-mute)]">
                      {email.provider_id ? providerById.get(email.provider_id) : t("unknown")}
                    </span>
                    <span className="truncate text-right text-xs text-[var(--color-fg-subtle)]">
                      {new Date(email.received_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <QualityCard
          icon={<ShieldCheck size={16} />}
          title={t("quality.security")}
          text={t("quality.securityText")}
        />
        <QualityCard
          icon={<CheckCircle2 size={16} />}
          title={t("quality.idempotency")}
          text={t("quality.idempotencyText")}
        />
        <QualityCard
          icon={<Mail size={16} />}
          title={t("quality.adapters")}
          text={t("quality.adaptersText")}
        />
      </section>
    </div>
  );
}

const inputClassName =
  "h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]";

function emailSourceWebhookUrl(baseUrl: string, source: EmailSource) {
  const url = new URL(baseUrl);
  url.searchParams.set("adapter", source.settings?.adapter ?? "mailgun");
  url.searchParams.set("secret", source.settings?.webhook_secret ?? "YOUR_SOURCE_SECRET");
  url.searchParams.set("source_id", source.id);
  return url.toString();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function SetupRow({
  label,
  value,
  copyLabel,
  onCopy,
}: {
  label: string;
  value: string;
  copyLabel?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[150px_minmax(0,1fr)_80px] items-center gap-3 border-b border-[var(--color-border)] px-3 last:border-b-0">
      <span className="truncate text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
        {label}
      </span>
      <code className="truncate font-mono text-xs text-[var(--color-fg)]">{value}</code>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          className="justify-self-end text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
        >
          {copyLabel}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function SourceStatus({ status }: { status: EmailSource["status"] }) {
  const t = useTranslations("ingestHub.emailIngest");
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex h-6 w-[74px] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border px-2 text-xs font-medium whitespace-nowrap",
        active
          ? "border-[color:var(--color-teal)]/30 bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]",
      )}
    >
      {active ? (
        <CheckCircle2 size={12} aria-hidden="true" />
      ) : (
        <PauseCircle size={12} aria-hidden="true" />
      )}
      {active ? t("active") : t("paused")}
    </span>
  );
}

function QualityCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 text-[var(--color-fg)]">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-[var(--color-fg-mute)]">{text}</p>
    </div>
  );
}
