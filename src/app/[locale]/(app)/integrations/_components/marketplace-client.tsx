"use client";

import * as React from "react";
import { Search, PlugZap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IntegrationCard } from "./integration-card";
import {
  INTEGRATIONS_REGISTRY,
  INTEGRATION_CATEGORIES,
  type IntegrationCategory,
  type IntegrationStatus,
} from "@/lib/integrations/registry";

/** Serializable slice passed from the RSC. Icons live in INTEGRATIONS_REGISTRY client-side. */
interface MarketplaceItem {
  id: string;
  status: IntegrationStatus;
}

interface MarketplaceClientProps {
  items: MarketplaceItem[];
  /** Locale prefix used to build hrefs to /[locale]/integrations/[slug] */
  localePrefix: string;
}

export function MarketplaceClient({ items, localePrefix }: MarketplaceClientProps) {
  const t = useTranslations("integrations.marketplace");
  const tCatalog = useTranslations("integrations.catalog");

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<IntegrationCategory | "all">("all");

  // Merge RSC-resolved statuses with the full descriptors from the local registry.
  const resolvedItems = React.useMemo(() => {
    return items.flatMap(({ id, status }) => {
      const descriptor = INTEGRATIONS_REGISTRY.find((d) => d.id === id);
      return descriptor ? [{ descriptor, status }] : [];
    });
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return resolvedItems.filter(({ descriptor }) => {
      if (category !== "all" && descriptor.category !== category) return false;
      if (!q) return true;
      const name = safeT(tCatalog, `${descriptor.slug}.name`, descriptor.name).toLowerCase();
      return (
        name.includes(q) ||
        descriptor.slug.toLowerCase().includes(q) ||
        descriptor.category.toLowerCase().includes(q)
      );
    });
  }, [resolvedItems, search, category, tCatalog]);

  const handleClearFilters = () => {
    setSearch("");
    setCategory("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        labels={{
          searchPlaceholder: t("search"),
          categories: {
            all: t("categories.all"),
            erp: t("categories.erp"),
            ecommerce: t("categories.ecommerce"),
            marketplace: t("categories.marketplace"),
            accounting: t("categories.accounting"),
            tools: "Herramientas",
          },
        }}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actionLabel={t("clearFilters")}
          onAction={handleClearFilters}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ descriptor, status }, index) => {
            const i18n = {
              name: safeT(tCatalog, `${descriptor.slug}.name`, descriptor.name),
              tagline: safeT(tCatalog, `${descriptor.slug}.tagline`, ""),
              description: safeT(tCatalog, `${descriptor.slug}.description`, ""),
              statusConnected: t("status.connected"),
              statusAvailable: t("status.available"),
              statusComingSoon: t("status.comingSoon"),
              open: t("open"),
              notifyMe: t("notifyMe"),
            };
            return (
              <IntegrationCard
                key={descriptor.id}
                descriptor={descriptor}
                status={status}
                href={`${localePrefix}/integrations/${descriptor.slug}`}
                i18n={i18n}
                index={index}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: IntegrationCategory | "all";
  onCategoryChange: (value: IntegrationCategory | "all") => void;
  labels: {
    searchPlaceholder: string;
    categories: Record<"all" | IntegrationCategory, string>;
  };
}

function Toolbar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  labels,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative max-w-sm flex-1">
        <Search
          className="text-[var(--color-fg-subtle)] pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="pl-8"
          aria-label={labels.searchPlaceholder}
        />
      </div>

      <div
        role="tablist"
        aria-label="Integration categories"
        className="border-[var(--color-border)] bg-[var(--color-surface-mute)] inline-flex flex-wrap items-center gap-1 rounded-md border p-1"
      >
        {INTEGRATION_CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(cat)}
              className={cn(
                "rounded-[4px] px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:ring-[var(--color-blue)] focus-visible:ring-2 focus-visible:outline-none",
                active
                  ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                  : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
              )}
            >
              {labels.categories[cat]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="border-[var(--color-border)] flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <PlugZap className="text-[var(--color-fg-subtle)] size-10" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[var(--color-fg-mute)] text-xs">{description}</p>
      </div>
      <Button onClick={onAction} variant="outline" size="sm">
        {actionLabel}
      </Button>
    </div>
  );
}

function safeT(
  fn: ReturnType<typeof useTranslations>,
  key: string,
  fallback: string,
): string {
  try {
    return fn(key);
  } catch {
    return fallback;
  }
}
