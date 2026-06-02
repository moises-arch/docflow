"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Bot, FileText, LayoutTemplate, Mail, PackageSearch, ScanText, UserCheck } from "lucide-react";

const DETECTION_METHOD_KEYS = [
  { icon: Mail, slug: "emailDomain", auto: true },
  { icon: ScanText, slug: "subjectBody", auto: true },
  { icon: Bot, slug: "documentContent", auto: true },
  { icon: FileText, slug: "templateRules", auto: true },
  { icon: UserCheck, slug: "manualAssignment", auto: false },
] as const;

export function TemplatesSidebar() {
  const pathname = usePathname();
  const t = useTranslations("settings.providers.templatesNav");

  const items = [
    {
      href: "/templates",
      label: t("templatesLabel"),
      description: t("templatesDesc"),
      icon: PackageSearch,
      exact: true,
    },
    {
      href: "/templates/profile-studio",
      label: t("profileStudioLabel"),
      description: t("profileStudioDesc"),
      icon: LayoutTemplate,
      exact: false,
    },
  ];

  return (
    <aside className="flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="inline-flex items-center gap-2.5 text-sm font-medium text-[var(--color-fg)]">
          <PackageSearch size={16} className="text-[var(--color-fg-mute)]" aria-hidden="true" />
          <span>{t("templatesLabel")}</span>
        </div>
      </div>

      <nav className="space-y-0.5 px-3 py-3">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 transition-all duration-[120ms]",
                active
                  ? "bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)]"
                  : "hover:bg-[var(--color-surface-mute)]",
              )}
            >
              {active && (
                <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-r bg-[var(--color-fg)]" />
              )}
              <Icon
                size={16}
                className={cn("mt-px text-[var(--color-fg-mute)] transition-colors duration-[120ms]", active && "text-[var(--color-fg)]")}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("block truncate text-sm font-medium transition-colors duration-[120ms]", active ? "text-[var(--color-fg)]" : "text-[var(--color-fg-mute)]")}>
                  {item.label}
                </span>
                <span className="block truncate text-xs leading-tight text-[var(--color-fg-subtle)]">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Detection methods */}
      <div className="flex-1 overflow-y-auto border-t border-[var(--color-border)] px-3 py-3">
        <p className="mb-2.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-fg-subtle)]">
          {t("providerDetection")}
        </p>
        <div className="space-y-1">
          {DETECTION_METHOD_KEYS.map((method, i) => {
            const Icon = method.icon;
            return (
              <div key={i} className="flex gap-2.5 rounded-md px-2 py-2 hover:bg-[var(--color-surface-mute)]">
                <div className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded",
                  method.auto
                    ? "bg-violet-500/10 text-violet-500"
                    : "bg-[var(--color-surface-mute)] text-[var(--color-fg-mute)]",
                )}>
                  <Icon size={11} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--color-fg)]">
                      {t(`methods.${method.slug}.title`)}
                    </span>
                    <span className={cn(
                      "rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide",
                      method.auto
                        ? "bg-violet-500/10 text-violet-500"
                        : "bg-[var(--color-surface-mute)] text-[var(--color-fg-subtle)]",
                    )}>
                      {method.auto ? t("auto") : t("manual")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-fg-subtle)]">
                    {t(`methods.${method.slug}.description`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
          <p className="text-[10px] leading-snug text-[var(--color-fg-mute)]">
            {t("footer")}
          </p>
        </div>
      </div>
    </aside>
  );
}
