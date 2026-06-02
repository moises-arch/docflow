import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ArrowLeft, FileCog, LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { ReviewProfile } from "../_lib/types";

type Props = {
  profile: ReviewProfile;
  active: "configuration" | "layout";
  children: ReactNode;
};

export async function ProfileFrame({ profile, active, children }: Props) {
  const t = await getTranslations("templates.profileStudio.frame");
  const tKinds = await getTranslations("templates.profileStudio.kinds");

  const items = [
    {
      id: "configuration" as const,
      href: `/templates/profile-studio/${profile.id}/configuration`,
      label: t("configuration"),
      icon: FileCog,
    },
    {
      id: "layout" as const,
      href: `/templates/profile-studio/${profile.id}/layout`,
      label: t("layout"),
      icon: LayoutGrid,
    },
  ];

  const kindKey =
    profile.document_kind === "purchase_order"
      ? "purchaseOrder"
      : (profile.document_kind as "invoice" | "shipping" | "receipt" | "custom");

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
        <aside className="hidden h-full w-[260px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <Link
              href="/templates/profile-studio"
              className="mb-4 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              {t("back")}
            </Link>
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-fg)]">
                  {getInitials(profile.name)}
                </div>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
                  <span
                    className={cn(
                      "size-1.5 rounded-[var(--radius-sm)]",
                      profile.active
                        ? "bg-[color:var(--color-teal)]"
                        : "bg-[color:var(--color-amber)]",
                    )}
                  />
                  {profile.active ? t("active") : t("paused")}
                </span>
              </div>
              <h1 className="text-base leading-5 font-semibold text-[var(--color-fg)]">
                {profile.name}
              </h1>
              <p className="mt-1 text-xs leading-5 break-words text-[var(--color-fg-mute)]">
                {tKinds(kindKey)}
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
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mx-auto grid w-full gap-5">{children}</div>
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
