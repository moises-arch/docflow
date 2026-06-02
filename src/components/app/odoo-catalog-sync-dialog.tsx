"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceStrict } from "date-fns";
import { es as esLocale, enUS as enLocale } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Loader2,
  Package,
  Users,
  Database,
  Zap,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Scope = "products" | "catalog" | "schema" | "all";

type ScopeStatus = {
  last_ok: { finished_at: string; imported: number | null; deactivated: number | null } | null;
  last_attempt: { started_at: string; ok: boolean | null; error: string | null } | null;
  next_cron_at: string | null;
};

type SyncStatus = {
  scopes: Record<"products" | "catalog" | "schema", ScopeStatus>;
};

interface Props {
  children: ReactNode;
}

const ENDPOINTS: Record<Exclude<Scope, "all">, string> = {
  products: "/api/settings/odoo/products/sync",
  catalog: "/api/integrations/odoo/catalog/sync",
  schema: "/api/integrations/odoo/schema/sync",
};

export function OdooCatalogSyncDialog({ children }: Props) {
  const t = useTranslations("odooCatalogSync");
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<Scope | null>(null);
  const [done, setDone] = useState<Set<Scope>>(new Set());
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const locale = useLocale();
  const dateFnsLocale = locale === "es" ? esLocale : enLocale;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setStatusError(false);
      try {
        const res = await fetch("/api/integrations/odoo/sync-status");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as SyncStatus;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) setStatusError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, done]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [open]);

  async function runOne(scope: Exclude<Scope, "all">): Promise<boolean> {
    const res = await fetch(ENDPOINTS[scope], { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      imported?: number;
      synced?: number;
      upserted?: number;
      deactivated?: number;
    };
    if (!res.ok) {
      toast.error(t(`${scope}.error`), {
        description: body.detail ?? body.error,
        duration: 6000,
      });
      return false;
    }
    const count = body.imported ?? body.synced ?? body.upserted;
    toast.success(t(`${scope}.success`), {
      description:
        typeof count === "number"
          ? t("countDetail", {
              count,
              deactivated: body.deactivated ?? 0,
            })
          : undefined,
    });
    return true;
  }

  async function run(scope: Scope) {
    setRunning(scope);
    try {
      if (scope === "all") {
        const order: Array<Exclude<Scope, "all">> = ["catalog", "products", "schema"];
        const completed = new Set<Scope>();
        for (const s of order) {
          const ok = await runOne(s);
          if (!ok) {
            setDone(completed);
            return;
          }
          completed.add(s);
          setDone(new Set(completed));
        }
        completed.add("all");
        setDone(completed);
        toast.success(t("all.success"));
      } else {
        const ok = await runOne(scope);
        if (ok) {
          setDone((prev) => new Set(prev).add(scope));
        }
      }
    } finally {
      setRunning(null);
    }
  }

  function handleOpenChange(next: boolean) {
    if (running !== null) return;
    setOpen(next);
    if (!next) setDone(new Set());
  }

  const options: Array<{
    scope: Exclude<Scope, "all">;
    icon: typeof Package;
    iconBg: string;
  }> = [
    { scope: "products", icon: Package, iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { scope: "catalog", icon: Users, iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { scope: "schema", icon: Database, iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[560px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <RefreshCw size={16} />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-semibold">{t("title")}</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                {t("subtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-3">
          {options.map(({ scope, icon: Icon, iconBg }) => {
            const isRunning = running === scope;
            const isDone = done.has(scope);
            const disabled = running !== null;
            return (
              <div
                key={scope}
                className="rounded-lg border border-border bg-card p-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", iconBg)}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">
                        {t(`${scope}.title`)}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(`${scope}.summary`)}
                      </p>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      <li>• {t(`${scope}.detail1`)}</li>
                      <li>• {t(`${scope}.detail2`)}</li>
                      <li>• {t(`${scope}.detail3`)}</li>
                    </ul>
                    {status && status.scopes[scope] && (() => {
                      const s = status.scopes[scope];
                      const lastAttempt = s.last_attempt;
                      const lastOk = s.last_ok;

                      const failedMoreRecent =
                        lastAttempt && lastAttempt.ok === false &&
                        (!lastOk || new Date(lastAttempt.started_at) > new Date(lastOk.finished_at));

                      return (
                        <div className="space-y-0.5 pt-1 text-[10px]">
                          {failedMoreRecent ? (
                            <p
                              className="text-red-600 dark:text-red-400"
                              title={lastAttempt!.error ?? ""}
                            >
                              ⚠ {t("timer.failedAgo", {
                                time: formatDistanceStrict(new Date(lastAttempt!.started_at), now, { locale: dateFnsLocale }),
                              })}
                            </p>
                          ) : lastOk ? (
                            <p className="text-emerald-600 dark:text-emerald-400">
                              ✓ {typeof lastOk.imported === "number"
                                ? t("timer.lastSyncOkWithCount", {
                                    time: formatDistanceStrict(new Date(lastOk.finished_at), now, { locale: dateFnsLocale }),
                                    count: lastOk.imported,
                                  })
                                : t("timer.lastSyncOk", {
                                    time: formatDistanceStrict(new Date(lastOk.finished_at), now, { locale: dateFnsLocale }),
                                  })}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">— {t("timer.neverSynced")}</p>
                          )}

                          {s.next_cron_at && (() => {
                            const next = new Date(s.next_cron_at);
                            const overdue = next.getTime() < now.getTime();
                            return (
                              <p className="text-muted-foreground">
                                ⏱ {overdue
                                  ? t("timer.nextRunOverdue", { time: formatDistanceStrict(next, now, { locale: dateFnsLocale }) })
                                  : t("timer.nextRun", { time: formatDistanceStrict(next, now, { locale: dateFnsLocale }) })}
                              </p>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    {statusError && (
                      <p className="pt-1 text-[10px] text-muted-foreground">{t("timer.loadError")}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                        {t(`${scope}.duration`)}
                      </span>
                      <Button
                        size="sm"
                        variant={isDone ? "outline" : "default"}
                        disabled={disabled}
                        onClick={() => run(scope)}
                        className="h-7 text-[11px]"
                      >
                        {isRunning ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : isDone ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        {isRunning
                          ? t("syncing")
                          : isDone
                            ? t("synced")
                            : t("sync")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Sync All - destacado */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/40 p-4 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Zap size={14} />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">{t("all.title")}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t("all.summary")}</p>
                </div>
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  <li>• {t("all.detail1")}</li>
                  <li>• {t("all.detail2")}</li>
                  <li className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                    <span>{t("all.detail3")}</span>
                  </li>
                </ul>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    {t("all.duration")}
                  </span>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={running !== null}
                    onClick={() => run("all")}
                    className="h-7 bg-amber-600 text-[11px] text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                  >
                    {running === "all" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : done.has("all") ? (
                      <Check className="size-3" />
                    ) : (
                      <Zap className="size-3" />
                    )}
                    {running === "all"
                      ? t("syncing")
                      : done.has("all")
                        ? t("synced")
                        : t("all.confirm")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-muted/20 px-5 py-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={running !== null}
            onClick={() => handleOpenChange(false)}
          >
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
