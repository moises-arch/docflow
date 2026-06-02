import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

type Method = "microsoft-365" | "imap";

const METHODS: Array<{
  key: Method;
  href: "/ingest/email/microsoft-365" | "/ingest/email/imap";
}> = [
  { key: "microsoft-365", href: "/ingest/email/microsoft-365" },
  { key: "imap", href: "/ingest/email/imap" },
];

export async function EmailMethodToolbar({ active }: { active?: Method }) {
  const t = await getTranslations("ingestHub.emailIngest.methods");

  return (
    <nav
      className="flex w-full gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-2"
      aria-label={t("label")}
    >
      {METHODS.map((method) => {
        const selected = method.key === active;
        return (
          <Link
            key={method.key}
            href={method.href}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-[var(--radius-sm)] border px-3 text-xs font-medium transition-colors",
              selected
                ? "border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
            )}
          >
            {t(method.key)}
          </Link>
        );
      })}
    </nav>
  );
}
