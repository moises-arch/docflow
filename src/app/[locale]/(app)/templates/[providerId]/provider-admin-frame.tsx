import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeft, Boxes, FileCog, GitBranch, History, Radar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Provider } from "../types";

type ProviderAdminFrameProps = {
  provider: Provider;
  active: "configuration" | "source-target" | "sku-mapping" | "document-history";
  children: ReactNode;
};

export async function ProviderAdminFrame({
  provider,
  active,
  children,
}: ProviderAdminFrameProps) {
  const t = await getTranslations("settings.providers.admin");
  const tProviders = await getTranslations("settings.providers");
  const items = [
    {
      id: "configuration" as const,
      href: `/templates/${provider.id}/configuration`,
      label: t("configuration"),
      description: t("configurationShort"),
      icon: FileCog,
    },
    {
      id: "source-target" as const,
      href: `/templates/${provider.id}/source-target`,
      label: t("sourceTarget"),
      icon: GitBranch,
    },
    {
      id: "sku-mapping" as const,
      href: `/templates/${provider.id}/sku-mapping`,
      label: t("skuMapping"),
      icon: Boxes,
    },
    {
      id: "document-history" as const,
      href: `/templates/${provider.id}/document-history`,
      label: t("documentHistory"),
      icon: History,
    },
  ];

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
        <aside className="hidden h-full w-[260px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <Link
              href="/templates"
              className="mb-4 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              {t("back")}
            </Link>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-fg)]">
                  {getInitials(provider.name)}
                </div>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
                  <span
                    className={cn(
                      "size-1.5 rounded-[var(--radius-sm)]",
                      provider.status === "active"
                        ? "bg-[color:var(--color-teal)]"
                        : "bg-[var(--color-fg-subtle)]",
                    )}
                  />
                  {provider.status === "active" ? tProviders("active") : tProviders("inactive")}
                </span>
              </div>
              <h1 className="text-base leading-5 font-semibold text-[var(--color-fg)]">
                {provider.name}
              </h1>
              <p className="mt-1 text-xs leading-5 break-words text-[var(--color-fg-mute)]">
                {provider.email_domains.join(", ") || provider.code}
              </p>
            </div>
          </div>
          <nav className="grid gap-1 p-3">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors duration-[120ms]",
                    isActive
                      ? "bg-[var(--color-bg)] font-medium text-[var(--color-fg)]"
                      : "text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)]",
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mx-3 mt-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-fg)]">
              <Radar size={13} aria-hidden="true" />
              {t("templateSignal")}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-fg-mute)]">
              {t("templateSignalDescription")}
            </p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto grid w-full max-w-7xl gap-5">{children}</div>
        </main>
      </div>
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
