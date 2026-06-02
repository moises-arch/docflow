import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../settings/_lib";
import { MarketplaceClient } from "./_components/marketplace-client";
import { MarketplaceSkeleton } from "./_components/marketplace-skeleton";
import { INTEGRATIONS_REGISTRY } from "@/lib/integrations/registry";
import {
  resolveIntegrationStatuses,
  countByStatus,
  type MinimalSupabaseClient,
} from "@/lib/integrations/status";

export default async function IntegrationsPage() {
  const { locale } = await requireSettingsAccess();
  const t = await getTranslations("integrations");
  const tM = await getTranslations("integrations.marketplace");

  return (
    <main className="mx-auto h-full w-full max-w-7xl overflow-y-auto px-6 py-6">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-[var(--color-fg-mute)] text-[10px] font-semibold uppercase tracking-widest">
            {tM("eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-[var(--color-fg-mute)] max-w-2xl text-sm">{tM("subtitle")}</p>
        </header>

        <Suspense fallback={<MarketplaceSkeleton />}>
          <MarketplaceGrid localePrefix={`/${locale}`} />
        </Suspense>
      </div>
    </main>
  );
}

async function MarketplaceGrid({ localePrefix }: { localePrefix: string }) {
  const { supabase, tenantId } = await requireSettingsAccess();
  const tM = await getTranslations("integrations.marketplace");

  const statuses = await resolveIntegrationStatuses(
    supabase as unknown as MinimalSupabaseClient,
    tenantId,
  );

  const counts = countByStatus(statuses);
  const items = INTEGRATIONS_REGISTRY.map((d) => ({
    id: d.id,
    status: statuses[d.id] ?? d.status,
  }));

  return (
    <div className="flex flex-col gap-4">
      {(counts.connected > 0 || counts.available > 0) && (
        <div className="text-[var(--color-fg-mute)] flex flex-wrap gap-3 text-xs">
          {counts.connected > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="bg-[var(--color-teal)] size-1.5 rounded-full" aria-hidden />
              {tM("summary.connected", { count: counts.connected })}
            </span>
          )}
          {counts.available > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="bg-[var(--color-border)] size-1.5 rounded-full" aria-hidden />
              {tM("summary.available", { count: counts.available })}
            </span>
          )}
        </div>
      )}
      <MarketplaceClient items={items} localePrefix={localePrefix} />
    </div>
  );
}
