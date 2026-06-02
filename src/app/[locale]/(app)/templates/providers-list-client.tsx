"use client";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Globe2,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  Plus,
  Search,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import type { Provider, ProviderStats } from "./types";

type Props = {
  providers: Provider[];
  providerStats: Record<string, ProviderStats>;
};

type ViewMode = "grid" | "table";

export function ProvidersListClient({ providers, providerStats }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.providers");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    return (localStorage.getItem("templates.view") as ViewMode | null) ?? "table";
  });

  const setViewMode = (next: ViewMode) => {
    setView(next);
    if (typeof window !== "undefined") localStorage.setItem("templates.view", next);
  };

  const [providerList] = useState(providers);

  const filteredProviders = providerList.filter((provider) => {
    const haystack = [provider.name, provider.code, ...(provider.email_domains ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const domains = String(form.get("email_domains") ?? "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);

    setBusy(true);
    try {
      const response = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          code: form.get("code"),
          default_currency: form.get("default_currency"),
          email_domains: domains,
        }),
      });

      if (!response.ok) throw new Error("create_failed");
      toast.success(t("providers.created"));
      router.refresh();
    } catch {
      toast.error(t("providers.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-fg-subtle)]"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("providers.search")}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pr-3 pl-9 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] hover:border-[var(--color-border-hv)] focus:border-[var(--color-fg)]"
          />
        </label>
        <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--color-fg-subtle)]">
          <span className="tabular-nums">
            {t("providers.results", { count: filteredProviders.length })}
          </span>
          <div className="flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] transition-colors",
                view === "grid"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
              )}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-pressed={view === "table"}
              aria-label="Table view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] transition-colors",
                view === "table"
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
              )}
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>

      {view === "table" ? (
        <ProvidersTable
          providers={filteredProviders}
          providerStats={providerStats}
          emptyMessage={t("providers.emptySearch")}
        />
      ) : null}

      <section className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", view === "table" && "hidden")}>
        {filteredProviders.map((provider) => (
          <article
            key={provider.id}
            className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors duration-[120ms] hover:border-[var(--color-border-hv)] hover:bg-[var(--color-bg)]"
          >
            <Link
              href={`/templates/${provider.id}/configuration`}
              className="block focus:outline-none"
            >
              <ProviderCard provider={provider} stats={providerStats[provider.id] ?? emptyStats} />
            </Link>

          </article>
        ))}

        {filteredProviders.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-hv)] bg-[var(--color-surface)] p-8 text-center md:col-span-2 xl:col-span-3">
            <p className="text-sm font-semibold text-[var(--color-fg)]">
              {t("providers.emptySearch")}
            </p>
            <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
              {t("providers.emptySearchDescription")}
            </p>
          </div>
        ) : null}

        <article className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-hv)] bg-[var(--color-surface)] p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
              <Plus size={17} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                {t("providers.addNew")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-fg-mute)]">
                {t("providers.addNewDescription")}
              </p>
            </div>
          </div>
          <form onSubmit={createProvider} className="grid gap-3">
            <TextInput name="name" label={t("providers.name")} required />
            <TextInput name="code" label={t("providers.code")} required />
            <TextInput name="default_currency" label={t("providers.currency")} maxLength={3} />
            <TextInput name="email_domains" label={t("providers.domains")} />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus size={13} aria-hidden="true" />
              )}
              {t("providers.add")}
            </Button>
          </form>
        </article>
      </section>
    </div>
  );
}

const emptyStats: ProviderStats = {
  fieldMappingCount: 0,
  skuMappingCount: 0,
  documentsTotal: 0,
  documentsReviewed: 0,
  documentsNeedsReview: 0,
  documentsFailed: 0,
  lastDocumentAt: null,
};

function ProviderCard({ provider, stats }: { provider: Provider; stats: ProviderStats }) {
  const t = useTranslations("settings.providers");
  const contactEmail = getSetting(provider, "contact_email");
  const website = getSetting(provider, "website") ?? provider.email_domains?.[0] ?? null;
  const initials = getInitials(provider.name);
  const hasCorrections = stats.fieldMappingCount > 0 || stats.skuMappingCount > 0;

  return (
    <div className="grid gap-0 divide-y divide-[var(--color-border)]">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pr-10">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm font-bold text-[var(--color-fg)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--color-fg)]">{provider.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-fg-subtle)]">
            {provider.code}
          </p>
          {(website ?? contactEmail) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {website && <ProviderLine icon={Globe2} value={website} />}
              {contactEmail && <ProviderLine icon={Mail} value={contactEmail} />}
            </div>
          )}
        </div>
      </div>

      {/* AI status — the key message */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-500/10">
          <Bot size={13} className="text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--color-fg)]">
            {t("card.aiTitle")}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-fg-mute)]">
            {t("card.aiDescription")}
          </p>
        </div>
      </div>

      {/* Corrections (Studio overrides) */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
          {t("card.studioCorrections")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {/* Field corrections */}
          <div className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-2",
            stats.fieldMappingCount > 0
              ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
              : "border-[var(--color-border)] bg-[var(--color-bg)]",
          )}>
            <GitBranch size={13} className={stats.fieldMappingCount > 0 ? "text-violet-500" : "text-[var(--color-fg-subtle)]"} />
            <div>
              <p className={cn("text-sm font-semibold tabular-nums", stats.fieldMappingCount > 0 ? "text-violet-600 dark:text-violet-400" : "text-[var(--color-fg)]")}>
                {stats.fieldMappingCount}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">{t("card.fieldRules")}</p>
            </div>
          </div>
          {/* SKU rules */}
          <div className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-2",
            stats.skuMappingCount > 0
              ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
              : "border-[var(--color-border)] bg-[var(--color-bg)]",
          )}>
            <Wrench size={13} className={stats.skuMappingCount > 0 ? "text-violet-500" : "text-[var(--color-fg-subtle)]"} />
            <div>
              <p className={cn("text-sm font-semibold tabular-nums", stats.skuMappingCount > 0 ? "text-violet-600 dark:text-violet-400" : "text-[var(--color-fg)]")}>
                {stats.skuMappingCount}
              </p>
              <p className="text-[10px] text-[var(--color-fg-subtle)]">{t("card.skuRules")}</p>
            </div>
          </div>
        </div>
        {!hasCorrections && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-fg-mute)]">
            <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
            {t("card.noCorrections")}
          </p>
        )}
        {hasCorrections && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-fg-mute)]">
            <Sparkles size={11} className="text-violet-400 shrink-0" />
            {t("card.correctionsActive")}
          </p>
        )}
      </div>

      {/* Footer CTA */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <p className="text-[11px] text-[var(--color-fg-subtle)]">
          {t("card.openStudio")}
        </p>
        <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-fg-mute)]">
          <span>{t("providers.templateReady")}</span>
          <ArrowUpRight
            size={12}
            className="shrink-0 transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-fg)]"
          />
        </div>
      </div>
    </div>
  );
}


function ProviderLine({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-xs text-[var(--color-fg-mute)]">
      <Icon size={13} className="shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
      <span className="min-w-0 truncate">{value}</span>
    </p>
  );
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "P"
  );
}

function TextInput({
  name,
  label,
  required,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </span>
      <input
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
      />
    </label>
  );
}

function getSetting(provider: Provider, key: string) {
  const value = provider.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type SortKey = "name" | "documents" | "reviewed" | "needsReview" | "field" | "sku" | "lastActivity";
type SortDir = "asc" | "desc";

function ProvidersTable({
  providers,
  providerStats,
  emptyMessage,
}: {
  providers: Provider[];
  providerStats: Record<string, ProviderStats>;
  emptyMessage: string;
}) {
  const t = useTranslations("settings.providers");
  const [sortKey, setSortKey] = useState<SortKey>("documents");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sorted = [...providers].sort((a, b) => {
    const sa = providerStats[a.id] ?? emptyStats;
    const sb = providerStats[b.id] ?? emptyStats;
    let av: number | string = 0;
    let bv: number | string = 0;
    switch (sortKey) {
      case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      case "documents": av = sa.documentsTotal; bv = sb.documentsTotal; break;
      case "reviewed": av = sa.documentsReviewed; bv = sb.documentsReviewed; break;
      case "needsReview": av = sa.documentsNeedsReview; bv = sb.documentsNeedsReview; break;
      case "field": av = sa.fieldMappingCount; bv = sb.fieldMappingCount; break;
      case "sku": av = sa.skuMappingCount; bv = sb.skuMappingCount; break;
      case "lastActivity":
        av = sa.lastDocumentAt ?? "";
        bv = sb.lastDocumentAt ?? "";
        break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  if (providers.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-hv)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm font-semibold text-[var(--color-fg)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <SortableTh sortKey="name" current={sortKey} dir={sortDir} onToggle={toggleSort} align="left" sticky>
                {t("providers.name")}
              </SortableTh>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                {t("providers.domains")}
              </th>
              <SortableTh sortKey="documents" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right">
                Docs
              </SortableTh>
              <SortableTh sortKey="reviewed" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right">
                Reviewed
              </SortableTh>
              <SortableTh sortKey="needsReview" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right">
                Pending
              </SortableTh>
              <SortableTh sortKey="field" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right">
                {t("card.fieldRules")}
              </SortableTh>
              <SortableTh sortKey="sku" current={sortKey} dir={sortDir} onToggle={toggleSort} align="right">
                {t("card.skuRules")}
              </SortableTh>
              <SortableTh sortKey="lastActivity" current={sortKey} dir={sortDir} onToggle={toggleSort} align="left">
                Last activity
              </SortableTh>
              <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((provider) => {
              const stats = providerStats[provider.id] ?? emptyStats;
              const hasCorrections = stats.fieldMappingCount > 0 || stats.skuMappingCount > 0;
              const reviewedPct =
                stats.documentsTotal > 0
                  ? Math.round((stats.documentsReviewed / stats.documentsTotal) * 100)
                  : 0;
              const domain =
                provider.email_domains?.[0] ?? getSetting(provider, "website") ?? null;
              const initials = getInitials(provider.name);

              return (
                <tr
                  key={provider.id}
                  className="group border-b border-[var(--color-border)] transition-colors duration-[120ms] last:border-0 hover:bg-[var(--color-bg)]"
                >
                  {/* Name + code + status dot */}
                  <td className="px-3 py-2 sticky left-0 z-[1] bg-[var(--color-surface)] group-hover:bg-[var(--color-bg)]">
                    <Link
                      href={`/templates/${provider.id}/configuration`}
                      className="flex items-center gap-2.5 focus:outline-none"
                    >
                      <div className="relative grid size-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] font-bold text-[var(--color-fg)] group-hover:bg-[var(--color-surface)]">
                        {initials}
                        {hasCorrections && (
                          <span
                            className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-violet-500 ring-2 ring-[var(--color-surface)] group-hover:ring-[var(--color-bg)]"
                            title={t("card.correctionsActive")}
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[var(--color-fg)] leading-tight">
                          {provider.name}
                        </div>
                        <div className="truncate font-mono text-[10px] text-[var(--color-fg-subtle)] leading-tight">
                          {provider.code}
                        </div>
                      </div>
                    </Link>
                  </td>

                  {/* Domain */}
                  <td className="px-3 py-2 text-xs text-[var(--color-fg-mute)]">
                    {domain ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Globe2 size={11} className="text-[var(--color-fg-subtle)]" />
                        <span className="truncate">{domain}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-fg-subtle)]">—</span>
                    )}
                  </td>

                  {/* Total docs + progress bar */}
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-col items-end gap-0.5 min-w-[60px]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                          stats.documentsTotal > 0
                            ? "text-[var(--color-fg)]"
                            : "text-[var(--color-fg-subtle)]",
                        )}
                      >
                        <FileText size={11} className="text-[var(--color-fg-subtle)]" />
                        {stats.documentsTotal}
                      </span>
                      {stats.documentsTotal > 0 && (
                        <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--color-border)]">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${reviewedPct}%` }}
                            title={`${reviewedPct}% reviewed`}
                          />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Reviewed */}
                  <td className="px-3 py-2 text-right">
                    <NumberCell value={stats.documentsReviewed} tone="emerald" icon={CheckCircle2} />
                  </td>

                  {/* Needs review */}
                  <td className="px-3 py-2 text-right">
                    <NumberCell
                      value={stats.documentsNeedsReview}
                      tone={stats.documentsNeedsReview > 0 ? "amber" : "muted"}
                      icon={Clock3}
                    />
                    {stats.documentsFailed > 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-rose-500">
                        <AlertTriangle size={9} />
                        {stats.documentsFailed} failed
                      </div>
                    )}
                  </td>

                  {/* Field rules */}
                  <td className="px-3 py-2 text-right">
                    <NumberCell
                      value={stats.fieldMappingCount}
                      tone={stats.fieldMappingCount > 0 ? "violet" : "muted"}
                      icon={GitBranch}
                    />
                  </td>

                  {/* SKU rules */}
                  <td className="px-3 py-2 text-right">
                    <NumberCell
                      value={stats.skuMappingCount}
                      tone={stats.skuMappingCount > 0 ? "violet" : "muted"}
                      icon={Wrench}
                    />
                  </td>

                  {/* Last activity */}
                  <td className="px-3 py-2 text-xs text-[var(--color-fg-mute)] whitespace-nowrap">
                    {stats.lastDocumentAt ? (
                      <RelativeTime iso={stats.lastDocumentAt} />
                    ) : (
                      <span className="text-[var(--color-fg-subtle)]">—</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/templates/${provider.id}/configuration`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-fg-mute)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                    >
                      Open
                      <ArrowUpRight
                        size={11}
                        className="transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  sortKey,
  current,
  dir,
  onToggle,
  align,
  sticky,
  children,
}: {
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onToggle: (k: SortKey) => void;
  align: "left" | "right";
  sticky?: boolean;
  children: React.ReactNode;
}) {
  const isActive = current === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]",
        align === "right" ? "text-right" : "text-left",
        sticky && "sticky left-0 z-[2] bg-[var(--color-bg)]",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-[var(--color-fg)] transition-colors",
          isActive && "text-[var(--color-fg)]",
        )}
      >
        {align === "left" && children}
        <Icon size={10} className={cn(!isActive && "opacity-40")} />
        {align === "right" && children}
      </button>
    </th>
  );
}

function NumberCell({
  value,
  tone,
  icon: Icon,
}: {
  value: number;
  tone: "emerald" | "amber" | "violet" | "muted";
  icon: LucideIcon;
}) {
  const toneClass = {
    emerald: value > 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-[var(--color-fg-subtle)]",
    amber: value > 0 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "text-[var(--color-fg-subtle)]",
    violet: value > 0 ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "text-[var(--color-fg-subtle)]",
    muted: "text-[var(--color-fg-subtle)]",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        toneClass,
      )}
    >
      <Icon size={10} />
      {value}
    </span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  let label = "";
  if (day > 14) label = new Date(iso).toLocaleDateString();
  else if (day >= 1) label = `${day}d ago`;
  else if (hr >= 1) label = `${hr}h ago`;
  else if (min >= 1) label = `${min}m ago`;
  else label = "now";
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-fg-mute)]">
      <Clock3 size={10} className="text-[var(--color-fg-subtle)]" />
      {label}
    </span>
  );
}
