import { getTranslations } from "next-intl/server";
import { loadProvider } from "../_data";
import { ProviderAdminFrame } from "../provider-admin-frame";
import { DocumentLog } from "../configuration/document-log";
import { History } from "lucide-react";

export default async function ProviderDocumentHistoryPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const { provider } = await loadProvider(providerId);
  const t = await getTranslations("settings.providers.documentHistory");

  return (
    <ProviderAdminFrame provider={provider} active="document-history">
      <header className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
            <History size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-fg)]">{t("title")}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-fg-mute)]">
              {t("description", { provider: provider.name })}
            </p>
          </div>
        </div>
      </header>

      <DocumentLog providerId={provider.id} />
    </ProviderAdminFrame>
  );
}
