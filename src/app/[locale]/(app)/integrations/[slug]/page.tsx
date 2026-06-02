import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSettingsAccess } from "../../settings/_lib";
import { ComingSoon } from "../_components/coming-soon";
import { IntegrationDetailFrame } from "../_components/integration-detail-frame";
import {
  getIntegrationBySlug,
  type IntegrationStatus,
} from "@/lib/integrations/registry";
import {
  resolveIntegrationStatuses,
  type MinimalSupabaseClient,
} from "@/lib/integrations/status";

interface IntegrationDetailPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function IntegrationDetailPage({
  params,
}: IntegrationDetailPageProps) {
  const { slug, locale } = await params;
  const descriptor = getIntegrationBySlug(slug);

  if (!descriptor) {
    notFound();
  }

  // ERP has its own dedicated page (preserved). Redirect to it for now.
  // Once we migrate ERP content into this dynamic route, this can be removed.
  if (descriptor.slug === "odoo") {
    redirect(`/${locale}/integrations/odoo`);
  }
  // Email Inbound — read-only viewer, dedicated page.
  if (descriptor.slug === "email-inbound") {
    redirect(`/${locale}/integrations/email-inbound`);
  }

  const { supabase, tenantId } = await requireSettingsAccess();
  const tCatalog = await getTranslations("integrations.catalog");

  const statuses = await resolveIntegrationStatuses(
    supabase as unknown as MinimalSupabaseClient,
    tenantId,
  );
  const status: IntegrationStatus = statuses[descriptor.id] ?? descriptor.status;

  const description = safeT(
    tCatalog,
    `${descriptor.slug}.description`,
    "",
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <IntegrationDetailFrame
        descriptor={descriptor}
        status={status}
        localePrefix={`/${locale}`}
      >
        {status === "coming-soon" ? (
          <ComingSoon descriptor={descriptor} description={description} />
        ) : (
          <div className="border-[var(--color-border)] bg-[var(--color-surface)] rounded-md border px-6 py-12 text-center">
            <p className="text-[var(--color-fg-mute)] text-sm">{description}</p>
          </div>
        )}
      </IntegrationDetailFrame>
    </main>
  );
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
