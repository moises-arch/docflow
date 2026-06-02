import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { requireSettingsAccess } from "../settings/_lib";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Bot, Code2, FileStack, Mail, Network, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default async function IngestHubPage() {
  const { supabase, tenantId } = await requireSettingsAccess();
  const t = await getTranslations("ingestHub");
  const db = supabase as unknown as DynamicSupabaseClient;

  const [{ data: emailSources }, { data: providers }, { data: portalConnections }] =
    await Promise.all([
      db
        .from<Array<{ id: string; status: string }>>("email_ingest_sources")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .not("status", "eq", "archived")
        .order("created_at", { ascending: false }),
      db
        .from<Array<{ id: string; name: string }>>("providers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      db
        .from<Array<{ id: string; status: string }>>("browser_ingest_connections")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .not("status", "eq", "archived")
        .order("created_at", { ascending: false }),
    ]);

  const activeEmailCount = (emailSources ?? []).filter(
    (source) => source.status === "active",
  ).length;
  const activePortalCount = (portalConnections ?? []).filter(
    (source) => source.status === "active",
  ).length;
  const providerCount = providers?.length ?? 0;
  const sourceCount = (emailSources ?? []).length + (portalConnections ?? []).length;
  const activeChannelCount = 1 + (activeEmailCount > 0 ? 1 : 0) + (activePortalCount > 0 ? 1 : 0);

  return (
    <main className="h-full overflow-y-auto px-6 py-6">
        <div className="mx-auto grid w-full max-w-6xl gap-4">
          <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
                {t("console.eyebrow")}
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--color-fg)]">{t("title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-mute)]">
                {t("description")}
              </p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <ConsoleStat label={t("metrics.channels")} value={String(activeChannelCount)} />
              <ConsoleStat label={t("metrics.templates")} value={String(providerCount)} />
              <ConsoleStat label={t("metrics.sources")} value={String(sourceCount)} />
            </div>
          </header>

          <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="grid content-start gap-3">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-2">
                  <Network size={15} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-[var(--color-fg)]">
                    {t("console.network")}
                  </h2>
                </div>
                <div className="mt-4 grid gap-2">
                  <HealthRow label={t("manual.title")} value={t("status.active")} active />
                  <HealthRow
                    label={t("email.title")}
                    value={activeEmailCount > 0 ? t("status.active") : t("status.ready")}
                    active={activeEmailCount > 0}
                  />
                  <HealthRow
                    label={t("portal.title")}
                    value={activePortalCount > 0 ? t("status.active") : t("status.ready")}
                    active={activePortalCount > 0}
                  />
                  <HealthRow label={t("api.title")} value={t("status.planned")} />
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h2 className="text-sm font-semibold text-[var(--color-fg)]">{t("next.title")}</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--color-fg-mute)]">
                  {t("next.description")}
                </p>
                <div className="mt-3 grid gap-2">
                  <QuickLink href="/ingest/email" label={t("next.email")} />
                  <QuickLink href="/ingest/cleo" label={t("next.portal")} />
                </div>
              </div>
            </aside>

            <section className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <ChannelLane
                  icon={<UploadCloud size={17} aria-hidden="true" />}
                  title={t("manual.title")}
                  description={t("manual.description")}
                  status={t("manual.status")}
                  metric={t("manual.metric")}
                  tone="teal"
                />
                <ChannelLane
                  icon={<Mail size={17} aria-hidden="true" />}
                  title={t("email.title")}
                  description={t("email.description")}
                  status={activeEmailCount > 0 ? t("status.active") : t("status.ready")}
                  metric={t("email.metric", { count: activeEmailCount })}
                  href="/ingest/email"
                  tone="blue"
                />
                <ChannelLane
                  icon={<Bot size={17} aria-hidden="true" />}
                  title={t("portal.title")}
                  description={t("portal.description")}
                  status={activePortalCount > 0 ? t("status.active") : t("status.ready")}
                  metric={t("portal.metric", { count: activePortalCount })}
                  href="/ingest/cleo"
                  tone="amber"
                />
                <ChannelLane
                  icon={<Bot size={17} aria-hidden="true" />}
                  title={t("rithum.title")}
                  description={t("rithum.description")}
                  status={t("status.active")}
                  metric={t("rithum.metric")}
                  href="/ingest/rithum"
                  tone="teal"
                />
                <ChannelLane
                  icon={<Code2 size={17} aria-hidden="true" />}
                  title={t("walmart.title")}
                  description={t("walmart.description")}
                  status={t("status.active")}
                  metric={t("walmart.metric")}
                  href="/ingest/walmart"
                  tone="blue"
                />
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-fg)]">
                      {t("routing.title")}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
                      {t("routing.description")}
                    </p>
                  </div>
                  <span className="inline-flex h-7 items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-xs font-medium text-[var(--color-fg-mute)]">
                    {t("routing.live")}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                  <RoutingBlock
                    icon={<FileStack size={14} />}
                    label={t("routing.providers")}
                    value={String(providerCount)}
                  />
                  <Connector />
                  <RoutingBlock
                    icon={<Mail size={14} />}
                    label={t("routing.emailSources")}
                    value={String(emailSources?.length ?? 0)}
                  />
                  <Connector />
                  <RoutingBlock
                    icon={<Bot size={14} />}
                    label={t("routing.browserSources")}
                    value={String(portalConnections?.length ?? 0)}
                  />
                </div>
              </div>
            </section>
          </section>
        </div>
      </main>
  );
}

function ConsoleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[92px] border-r border-[var(--color-border)] px-3 py-2 last:border-r-0">
      <p className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-fg)]">{value}</p>
    </div>
  );
}

function HealthRow({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-md",
            active ? "bg-[color:var(--color-teal)]" : "bg-[var(--color-fg-subtle)]",
          )}
        />
        <span className="truncate text-xs font-medium text-[var(--color-fg)]">{label}</span>
      </div>
      <span className="shrink-0 text-xs text-[var(--color-fg-mute)]">{value}</span>
    </div>
  );
}

function ChannelLane({
  icon,
  title,
  description,
  status,
  metric,
  href,
  tone,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  metric: string;
  href?: "/ingest/email" | "/ingest/cleo" | "/ingest/rithum" | "/ingest/walmart";
  tone: "teal" | "blue" | "amber" | "rose";
}) {
  const toneClass = {
    teal: "border-[color:var(--color-teal)]/25 bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]",
    blue: "border-[color:var(--color-blue)]/25 bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]",
    amber: "border-[color:var(--color-amber)]/25 bg-[color:var(--color-amber)]/10 text-[color:var(--color-amber)]",
    rose: "border-[color:var(--color-rose)]/25 bg-[color:var(--color-rose)]/10 text-[color:var(--color-rose)]",
  }[tone];

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border",
            toneClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="truncate text-base font-semibold text-[var(--color-fg)]">{title}</h2>
            <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs font-medium text-[var(--color-fg-mute)]">
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-[var(--color-fg-mute)]">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <p className="truncate text-xs font-medium text-[var(--color-fg-subtle)]">{metric}</p>
        {href ? (
          <ArrowRight size={14} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
        ) : null}
      </div>
    </>
  );

  const className =
    "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors duration-[120ms]";

  if (href) {
    return (
      <Link
        href={href}
        className={`${className} hover:border-[var(--color-border-hv)] hover:bg-[var(--color-surface-mute)]`}
      >
        {content}
      </Link>
    );
  }

  return <article className={`${className} cursor-default select-none opacity-80`}>{content}</article>;
}

function RoutingBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex h-16 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3">
      <div className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-mute)]">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">{label}</p>
        <p className="mt-1 text-base font-semibold text-[var(--color-fg)]">{value}</p>
      </div>
    </div>
  );
}

function Connector() {
  return <div className="hidden h-px w-8 bg-[var(--color-border-hv)] md:block" />;
}

function QuickLink({
  href,
  label,
}: {
  href: "/ingest/email" | "/ingest/cleo" | "/ingest/rithum" | "/ingest/walmart";
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-9 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-border-hv)] hover:bg-[var(--color-surface-mute)]"
    >
      <span>{label}</span>
      <ArrowRight size={14} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
    </Link>
  );
}
