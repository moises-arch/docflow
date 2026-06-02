"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotifications, type NotificationSeverity } from "@/lib/notifications/use-notifications";
import { NotificationsList } from "@/components/app/notifications-list";
import { Search } from "lucide-react";

const ALL_SEVERITIES: NotificationSeverity[] = ["info", "success", "warning", "error"];
const ALL_SOURCES = ["workflow_event", "odoo_sync", "healthcheck", "admin"];

interface Props {
  tenantId: string;
}

export function NotificationsClient({ tenantId }: Props) {
  const t = useTranslations("notifications");
  const [severityFilter, setSeverityFilter] = useState<NotificationSeverity[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { items, unreadCount, loading, hasMore, loadMore, markRead, markAllRead } = useNotifications({
    limit: 50,
    severity: severityFilter.length ? severityFilter : undefined,
    source: sourceFilter.length ? sourceFilter : undefined,
    search: search || undefined,
    tenantId,
  });

  function toggleSeverity(s: NotificationSeverity) {
    setSeverityFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function toggleSource(s: string) {
    setSourceFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-[18px] font-semibold">{t("pageTitle")}</h1>
          <p className="text-[11px] text-muted-foreground">
            {t("pageSubtitle", { count: unreadCount })}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            {t("markAllRead")}
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <form onSubmit={applySearch} className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-56 pl-7 text-[12px]"
            />
          </div>
          <Button type="submit" size="sm" variant="ghost" className="h-8">
            {t("apply")}
          </Button>
        </form>

        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("severity")}
          </span>
          {ALL_SEVERITIES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={severityFilter.includes(s) ? "default" : "outline"}
              onClick={() => toggleSeverity(s)}
              className="h-7 text-[10px]"
            >
              {t(`severityValues.${s}`)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("source")}
          </span>
          {ALL_SOURCES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={sourceFilter.includes(s) ? "default" : "outline"}
              onClick={() => toggleSource(s)}
              className="h-7 text-[10px]"
            >
              {t(`sourceValues.${s}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-muted-foreground">{t("loading")}</div>
        ) : (
          <NotificationsList
            items={items}
            onItemClick={(n) => n.read_at === null && markRead(n.id)}
            emptyMessage={t("empty")}
          />
        )}
        {hasMore && (
          <div className="border-t border-border p-4 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore}>
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
