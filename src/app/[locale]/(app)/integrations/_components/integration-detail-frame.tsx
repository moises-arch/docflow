import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IntegrationLogo } from "./integration-logo";
import type { IntegrationDescriptor, IntegrationStatus } from "@/lib/integrations/registry";

interface IntegrationDetailFrameProps {
  descriptor: IntegrationDescriptor;
  status: IntegrationStatus;
  localePrefix: string;
  /**
   * Optional action slot rendered next to the actions group (e.g. quick controls
   * specific to the integration like Test connection).
   */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export async function IntegrationDetailFrame({
  descriptor,
  status,
  localePrefix,
  actions,
  children,
}: IntegrationDetailFrameProps) {
  const t = await getTranslations("integrations");
  const tDetail = await getTranslations("integrations.detail");
  const tCatalog = await getTranslations("integrations.catalog");
  const tMarketplace = await getTranslations("integrations.marketplace");

  const name = safeT(tCatalog, `${descriptor.slug}.name`, descriptor.name);
  const tagline = safeT(tCatalog, `${descriptor.slug}.tagline`, "");
  const categoryLabel = safeT(
    tMarketplace,
    `categories.${descriptor.category}`,
    descriptor.category,
  );
  const statusLabels = {
    connected: tMarketplace("status.connected"),
    available: tMarketplace("status.available"),
    comingSoon: tMarketplace("status.comingSoon"),
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href={`${localePrefix}/integrations`}
          className="text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] focus-visible:ring-[var(--color-blue)] inline-flex w-fit items-center gap-1 rounded-[4px] text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {tDetail("back")}
        </Link>

        <div
          className={cn(
            "border-[var(--color-border)] bg-[var(--color-surface)] relative overflow-hidden rounded-md border p-5",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-0 left-0 h-1 w-full",
              accentTopBarClass(descriptor.accent),
            )}
          />

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <IntegrationLogo descriptor={descriptor} size={48} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
                  <StatusPill status={status} labels={statusLabels} />
                  <span className="text-[var(--color-fg-mute)] inline-flex items-center rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {categoryLabel}
                  </span>
                </div>
                {tagline && (
                  <p className="text-[var(--color-fg-mute)] mt-1 text-sm">{tagline}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {descriptor.docsUrl && (
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={descriptor.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-fg-mute)]"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {tDetail("actions.viewDocs")}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div>{children}</div>

      <span className="sr-only">{t("title")}</span>
    </div>
  );
}

interface StatusPillProps {
  status: IntegrationStatus;
  labels: { connected: string; available: string; comingSoon: string };
}

function StatusPill({ status, labels }: StatusPillProps) {
  if (status === "connected") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1 rounded-[999px] border border-[color-mix(in_oklab,var(--color-teal)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-teal)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-teal)]"
      >
        <span className="bg-[var(--color-teal)] size-1.5 rounded-[999px]" aria-hidden />
        {labels.connected}
      </span>
    );
  }
  if (status === "coming-soon") {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1 rounded-[999px] border border-[color-mix(in_oklab,var(--color-amber)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-amber)_10%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-amber)]"
      >
        <span className="bg-[var(--color-amber)] size-1.5 rounded-[999px]" aria-hidden />
        {labels.comingSoon}
      </span>
    );
  }
  return (
    <span
      role="status"
      className="text-[var(--color-fg-mute)] inline-flex items-center rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2 py-0.5 text-[10px] font-medium"
    >
      {labels.available}
    </span>
  );
}

function accentTopBarClass(accent: IntegrationDescriptor["accent"]): string {
  switch (accent) {
    case "blue":
      return "bg-[var(--color-blue)]";
    case "teal":
      return "bg-[var(--color-teal)]";
    case "violet":
      return "bg-[var(--color-violet)]";
    case "amber":
      return "bg-[var(--color-amber)]";
    case "rose":
      return "bg-[var(--color-rose)]";
    case "slate":
    default:
      return "bg-[var(--color-fg-mute)]";
  }
}

function safeT(
  fn: Awaited<ReturnType<typeof getTranslations>>,
  key: string,
  fallback: string,
): string {
  try {
    return fn(key);
  } catch {
    return fallback;
  }
}
