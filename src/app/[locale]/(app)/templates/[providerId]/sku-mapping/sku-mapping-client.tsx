"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { OdooProduct, ProductMapping } from "../../types";

type StatusFilter = "all" | "mapped" | "unmapped";

type Props = {
  providerId: string;
  products: OdooProduct[];
  mappings: ProductMapping[];
};

export function SkuMappingClient({ providerId, products, mappings }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.providers");
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [syncing, setSyncing] = useState(false);
  const initialSkuByProduct = useMemo(() => buildSkuByProduct(mappings), [mappings]);
  const savedSkuByProductRef = useRef<Record<number, string>>({ ...initialSkuByProduct });
  const [skuByProduct, setSkuByProduct] = useState<Record<number, string>>(initialSkuByProduct);

  const mappingsByProduct = useMemo(() => {
    const grouped = new Map<number, ProductMapping[]>();
    for (const mapping of mappings) {
      const current = grouped.get(mapping.odoo_product_id) ?? [];
      current.push(mapping);
      grouped.set(mapping.odoo_product_id, current);
    }
    return grouped;
  }, [mappings]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const isMapped = hasProviderSku(product.odoo_product_id, skuByProduct);
      if (statusFilter === "mapped" && !isMapped) return false;
      if (statusFilter === "unmapped" && isMapped) return false;
      if (!normalizedQuery) return true;

      const aliases = mappingsByProduct
        .get(product.odoo_product_id)
        ?.flatMap((mapping) => [
          mapping.source_sku,
          mapping.source_company_sku,
          mapping.source_description,
        ])
        .filter(Boolean)
        .join(" ");
      return [
        product.name,
        product.default_code,
        product.barcode,
        aliases,
        skuByProduct[product.odoo_product_id],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [mappingsByProduct, products, query, skuByProduct, statusFilter]);

  const mappedCount = products.filter((product) =>
    hasProviderSku(product.odoo_product_id, skuByProduct),
  ).length;
  const unmappedCount = Math.max(products.length - mappedCount, 0);

  async function saveProviderSku(product: OdooProduct) {
    if (busyProductId) return;
    const nextSku = (skuByProduct[product.odoo_product_id] ?? "").trim();
    const savedSku = (savedSkuByProductRef.current[product.odoo_product_id] ?? "").trim();
    if (!nextSku || nextSku === savedSku) return;

    setBusyProductId(product.odoo_product_id);
    try {
      const response = await fetch("/api/settings/providers/product-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          source_sku: nextSku,
          odoo_product_id: product.odoo_product_id,
          odoo_product_name: product.name,
          odoo_default_code: product.default_code,
        }),
      });
      if (!response.ok) throw new Error("create_failed");
      savedSkuByProductRef.current[product.odoo_product_id] = nextSku;
      toast.success(t("productMappings.saved"));
    } catch {
      toast.error(t("productMappings.createFailed"));
    } finally {
      setBusyProductId(null);
    }
  }

  function handleSkuKeyDown(event: KeyboardEvent<HTMLInputElement>, product: OdooProduct) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
    void saveProviderSku(product);
  }

  async function syncProducts() {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/settings/odoo/products/sync", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { imported?: number };
      if (!response.ok) throw new Error("sync_failed");
      toast.success(t("productMappings.syncSuccess", { count: body.imported ?? 0 }));
      router.refresh();
    } catch {
      toast.error(t("productMappings.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-fg)]">
            {t("productMappings.catalogTitle")}
          </p>
          <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
            {t("productMappings.autoHint")}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              {t("productMappings.filters.all", { count: products.length })}
            </FilterButton>
            <FilterButton
              active={statusFilter === "mapped"}
              onClick={() => setStatusFilter("mapped")}
            >
              {t("productMappings.filters.mapped", { count: mappedCount })}
            </FilterButton>
            <FilterButton
              active={statusFilter === "unmapped"}
              onClick={() => setStatusFilter("unmapped")}
            >
              {t("productMappings.filters.unmapped", { count: unmappedCount })}
            </FilterButton>
          </div>
          <label className="relative block md:w-72">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-fg-subtle)]"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("productMappings.searchProducts")}
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] pr-3 pl-8 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
            />
          </label>
          <Button type="button" size="sm" disabled={syncing} onClick={syncProducts}>
            {syncing && <Loader2 className="size-4 animate-spin" />}
            {t("productMappings.syncProducts")}
          </Button>
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {products.length === 0 ? (
          <div className="grid place-items-center gap-3 p-8 text-center">
            <div>
              <p className="text-sm font-semibold text-[var(--color-fg)]">
                {t("productMappings.emptyTitle")}
              </p>
              <p className="mt-1 max-w-md text-sm text-[var(--color-fg-mute)]">
                {t("productMappings.emptyDescription")}
              </p>
            </div>
            <Button type="button" size="sm" disabled={syncing} onClick={syncProducts}>
              {syncing && <Loader2 className="size-4 animate-spin" />}
              {t("productMappings.syncProducts")}
            </Button>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-fg-mute)]">
            {t("productMappings.noFilteredProducts")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="grid h-8 grid-cols-[160px_minmax(280px,1fr)_260px_112px_64px] items-center border-b border-[var(--color-border)] bg-[var(--color-surface-mute)] px-3 text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase">
                <span className="truncate">{t("productMappings.defaultCode")}</span>
                <span className="truncate">{t("productMappings.odooProduct")}</span>
                <span className="truncate">{t("productMappings.providerSku")}</span>
                <span className="truncate text-right">{t("targetFields.status")}</span>
                <span className="truncate text-right">{t("productMappings.source")}</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {visibleProducts.map((product) => {
                  const productMappings = mappingsByProduct.get(product.odoo_product_id) ?? [];
                  const isMapped = hasProviderSku(product.odoo_product_id, skuByProduct);
                  return (
                    <div
                      key={product.odoo_product_id}
                      className="grid h-11 grid-cols-[160px_minmax(280px,1fr)_260px_112px_64px] items-center gap-3 px-3 transition-colors duration-[120ms] hover:bg-[var(--color-surface-mute)]"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono text-xs font-semibold text-[var(--color-fg)]">
                          {product.default_code ??
                            product.barcode ??
                            t("productMappings.noInternalRef")}
                        </span>
                        {productMappings.some((mapping) => mapping.source === "auto") ? (
                          <AutoBadge />
                        ) : null}
                      </div>
                      <p className="min-w-0 truncate text-sm whitespace-nowrap text-[var(--color-fg)]">
                        {product.name}
                      </p>
                      <label className="block min-w-0">
                        <span className="sr-only">{t("productMappings.providerSku")}</span>
                        <input
                          value={skuByProduct[product.odoo_product_id] ?? ""}
                          onChange={(event) =>
                            setSkuByProduct((current) => ({
                              ...current,
                              [product.odoo_product_id]: event.target.value,
                            }))
                          }
                          onBlur={() => void saveProviderSku(product)}
                          onKeyDown={(event) => handleSkuKeyDown(event, product)}
                          placeholder={t("productMappings.providerSkuPlaceholder")}
                          className="h-7 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm text-[var(--color-fg)] transition-colors duration-[120ms] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
                        />
                      </label>
                      <div className="flex justify-end">
                        <StatusPill mapped={isMapped} />
                      </div>
                      <span className="truncate text-right text-[11px] text-[var(--color-fg-subtle)]">
                        {busyProductId === product.odoo_product_id
                          ? t("productMappings.saving")
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function buildSkuByProduct(mappings: ProductMapping[]) {
  const skuByProduct: Record<number, string> = {};
  for (const mapping of mappings) {
    if (skuByProduct[mapping.odoo_product_id]) continue;
    const sku =
      mapping.source_sku || mapping.source_company_sku || mapping.source_description || "";
    if (sku) skuByProduct[mapping.odoo_product_id] = sku;
  }
  return skuByProduct;
}

function hasProviderSku(productId: number, skuByProduct: Record<number, string>) {
  return Boolean(skuByProduct[productId]?.trim());
}

function AutoBadge() {
  const t = useTranslations("settings.providers.productMappings");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] text-[10px] font-medium text-[color:var(--color-blue)]">
      <Sparkles size={10} aria-hidden="true" />
      {t("sources.auto")}
    </span>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-[var(--radius-sm)] border px-3 text-xs font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)] hover:border-[var(--color-border-hv)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
    </button>
  );
}

function StatusPill({ mapped }: { mapped: boolean }) {
  const t = useTranslations("settings.providers.productMappings");
  return (
    <span
      className={cn(
        "inline-flex h-6 w-[104px] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border px-2 text-xs font-medium whitespace-nowrap",
        mapped
          ? "border-[color:var(--color-teal)]/30 bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-[var(--radius-sm)]",
          mapped ? "bg-[color:var(--color-teal)]" : "bg-[var(--color-fg-subtle)]",
        )}
      />
      {mapped ? t("mapped") : t("unmapped")}
    </span>
  );
}
