"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale, enUS as enLocale } from "date-fns/locale";
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification, NotificationSeverity } from "@/lib/notifications/use-notifications";

interface Props {
  items: Notification[];
  onItemClick?: (n: Notification) => void;
  emptyMessage?: string;
  compact?: boolean;
}

const SEVERITY_ICONS: Record<NotificationSeverity, typeof Info> = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  error: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  info: "text-blue-600 dark:text-blue-400",
};

export function NotificationsList({ items, onItemClick, emptyMessage, compact = false }: Props) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const dfLocale = locale === "es" ? esLocale : enLocale;

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
        {emptyMessage ?? t("empty")}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((n) => {
        const Icon = SEVERITY_ICONS[n.severity] ?? Info;
        const colorCls = SEVERITY_COLORS[n.severity] ?? "text-muted-foreground";
        const isUnread = n.read_at === null;
        const content = (
          <div
            className={cn(
              "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
              isUnread && "bg-muted/20",
            )}
          >
            <Icon className={cn("size-4 shrink-0 mt-0.5", colorCls)} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[12px] leading-tight",
                  isUnread ? "font-semibold text-foreground" : "text-foreground/80",
                )}
              >
                {n.title}
              </p>
              {n.description && !compact && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.description}</p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatDistanceToNowStrict(new Date(n.created_at), {
                  addSuffix: true,
                  locale: dfLocale,
                })}
              </p>
            </div>
            {isUnread && (
              <span
                className="mt-1 size-1.5 shrink-0 rounded-full bg-blue-500"
                aria-label="unread"
              />
            )}
          </div>
        );

        return (
          <li key={n.id}>
            {n.href ? (
              <Link href={n.href} onClick={() => onItemClick?.(n)} className="block">
                {content}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onItemClick?.(n)}
                className="block w-full text-left"
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
