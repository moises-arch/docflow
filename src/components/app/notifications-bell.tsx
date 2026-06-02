"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { NotificationsList } from "./notifications-list";

interface Props {
  tenantId?: string;
}

export function NotificationsBell({ tenantId }: Props) {
  const t = useTranslations("notifications");
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  useEffect(() => {
    if (resolvedTenantId) return;
    let cancelled = false;
    fetch("/api/me/tenant")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tenant_id?: string } | null) => {
        if (!cancelled && d?.tenant_id) setResolvedTenantId(d.tenant_id);
      })
      .catch(() => {
        /* silencioso */
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedTenantId]);

  const { items, unreadCount, markRead, markAllRead } = useNotifications({
    limit: 10,
    tenantId: resolvedTenantId ?? undefined,
  });

  const badge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7"
          aria-label={t("bellLabel")}
        >
          <Bell className="size-3.5" />
          {badge && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-[12px] font-semibold">{t("title")}</h3>
          {unreadCount > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[11px]"
              onClick={markAllRead}
            >
              {t("markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <NotificationsList
            items={items}
            onItemClick={(n) => n.read_at === null && markRead(n.id)}
            compact
          />
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2 text-center">
          <Button variant="link" size="sm" asChild className="h-auto p-0 text-[11px]">
            <Link href="/notificaciones">{t("viewAll")}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
