"use client";

import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale, enUS as enLocale } from "date-fns/locale";
import { useLocale } from "next-intl";
import { toast } from "sonner";

type SessionState = "ok" | "stale" | "unknown";

interface IntegrationStatus {
  enabled: boolean;
  last_healthcheck: {
    ok: boolean;
    finished_at: string;
    summary: string | null;
  } | null;
  last_order_at: string | null;
  orders_last_24h: number;
  session_state: SessionState;
}

interface HealthPayload {
  overall_ok: boolean;
  rithum: IntegrationStatus;
  cleo: IntegrationStatus;
  walmart: IntegrationStatus;
  m365: IntegrationStatus;
}

type IntegrationKey = "rithum" | "cleo" | "walmart" | "m365";

interface Props {
  children: ReactNode;
}

const SMOKE_ENDPOINTS: Record<IntegrationKey, string> = {
  rithum: "/api/ingest/rithum/smoke",
  cleo: "/api/ingest/cleo/smoke",
  walmart: "/api/ingest/walmart/smoke",
  m365: "/api/ingest/m365/smoke",
};

// Brand logos SVG inline (16×16 viewport)
function RithumLogo() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
      {/* Supplier Portal / Supplier Portal — orange hexagon wordmark shape */}
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#F26522" opacity="0.15" />
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" stroke="#F26522" strokeWidth="2.5" fill="none" />
      <text x="16" y="21" textAnchor="middle" fontSize="12" fontWeight="700" fill="#F26522" fontFamily="system-ui,sans-serif">R</text>
    </svg>
  );
}

function CleoLogo() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
      {/* Supplier Portal — green C arc */}
      <circle cx="16" cy="16" r="12" stroke="#00A651" strokeWidth="2.5" fill="none" />
      <path d="M24 10 A10 10 0 1 0 24 22" stroke="#00A651" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="16" r="12" fill="#00A651" opacity="0.10" />
    </svg>
  );
}

function WalmartLogo() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18">
      {/* Marketplace spark — 6 petals */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse
          key={deg}
          cx="16" cy="16"
          rx="3" ry="7"
          fill="#0071CE"
          transform={`rotate(${deg} 16 16) translate(0 -5)`}
        />
      ))}
    </svg>
  );
}

function M365Logo() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18">
      {/* Microsoft 4-color grid */}
      <rect x="4"  y="4"  width="10" height="10" rx="1.5" fill="#F25022" />
      <rect x="18" y="4"  width="10" height="10" rx="1.5" fill="#7FBA00" />
      <rect x="4"  y="18" width="10" height="10" rx="1.5" fill="#00A4EF" />
      <rect x="18" y="18" width="10" height="10" rx="1.5" fill="#FFB900" />
    </svg>
  );
}

const INTEGRATION_LOGO: Record<IntegrationKey, () => React.JSX.Element> = {
  rithum: RithumLogo,
  cleo: CleoLogo,
  walmart: WalmartLogo,
  m365: M365Logo,
};

export function IntegrationsDiagnosticsDialog({ children }: Props) {
  const t = useTranslations("integrationsDiagnostics");
  const locale = useLocale();
  const dfLocale = locale === "es" ? esLocale : enLocale;

  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [smokingAll, setSmokingAll] = useState(false);
  const [smokingOne, setSmokingOne] = useState<IntegrationKey | null>(null);

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch("/api/integrations/health");
      if (!res.ok) throw new Error();
      setHealth((await res.json()) as HealthPayload);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingHealth(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) void loadHealth();
  }, [open, loadHealth]);

  async function runSmoke(key: IntegrationKey) {
    setSmokingOne(key);
    try {
      const res = await fetch(SMOKE_ENDPOINTS[key], { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; checks?: unknown[] };
      if (body.ok) {
        toast.success(t("smokeSuccess", { name: t(`integration.${key}`) }));
      } else {
        toast.error(t("smokeFail", { name: t(`integration.${key}`) }));
      }
      await loadHealth();
    } catch {
      toast.error(t("smokeError"));
    } finally {
      setSmokingOne(null);
    }
  }

  async function runAll() {
    setSmokingAll(true);
    try {
      await Promise.all(
        (Object.keys(SMOKE_ENDPOINTS) as IntegrationKey[]).map((k) =>
          fetch(SMOKE_ENDPOINTS[k], { method: "POST" }).catch(() => null),
        ),
      );
      await loadHealth();
      toast.success(t("allSmokeSuccess"));
    } catch {
      toast.error(t("smokeError"));
    } finally {
      setSmokingAll(false);
    }
  }

  const integrations: IntegrationKey[] = ["rithum", "cleo", "walmart", "m365"];

  function relTime(iso: string) {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: dfLocale });
  }

  function statusDot(s: IntegrationStatus) {
    if (!s.enabled) return <span className="size-2 rounded-full bg-muted-foreground/40" />;
    if (!s.last_healthcheck) return <span className="size-2 rounded-full bg-muted-foreground/40" />;
    return s.last_healthcheck.ok ? (
      <span className="size-2 rounded-full bg-emerald-500" />
    ) : (
      <span className="size-2 rounded-full bg-red-500" />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[680px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Activity size={16} />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-semibold">{t("title")}</DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                {t("subtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-border bg-muted/20 px-5 py-2.5 flex items-center justify-between">
          <Button
            size="sm"
            variant="default"
            disabled={smokingAll || smokingOne !== null}
            onClick={runAll}
            className="h-7 text-[11px]"
          >
            {smokingAll ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Activity className="size-3" />
            )}
            {t("runAll")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={loadingHealth}
            onClick={loadHealth}
            className="h-7 text-[11px]"
          >
            {loadingHealth ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            {t("refresh")}
          </Button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
          {loadingHealth && !health && (
            <div className="py-8 text-center text-[12px] text-muted-foreground">
              <Loader2 className="mx-auto size-4 animate-spin mb-2" />
              {t("loading")}
            </div>
          )}

          {integrations.map((key) => {
            const s = health?.[key];
            const Logo = INTEGRATION_LOGO[key];
            const isSmokingThis = smokingOne === key;
            const isDisabled = smokingAll || smokingOne !== null;

            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border border-border bg-card p-4",
                  s && !s.enabled && "opacity-50",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/40">
                    <Logo />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {s && statusDot(s)}
                      <h3 className="text-[13px] font-semibold text-foreground">
                        {t(`integration.${key}`)}
                      </h3>
                      {s && !s.enabled && (
                        <span className="text-[10px] text-muted-foreground">({t("notConfigured")})</span>
                      )}
                    </div>

                    {s ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        {/* Healthcheck */}
                        <div className="flex items-start gap-1.5">
                          {s.last_healthcheck ? (
                            s.last_healthcheck.ok ? (
                              <CheckCircle2 className="size-3 shrink-0 mt-0.5 text-emerald-500" />
                            ) : (
                              <XCircle className="size-3 shrink-0 mt-0.5 text-red-500" />
                            )
                          ) : (
                            <AlertCircle className="size-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                          )}
                          <div>
                            <span className="text-muted-foreground">{t("lastHealthcheck")}: </span>
                            {s.last_healthcheck ? (
                              <span
                                className={s.last_healthcheck.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                                title={s.last_healthcheck.summary ?? undefined}
                              >
                                {relTime(s.last_healthcheck.finished_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{t("noData")}</span>
                            )}
                          </div>
                        </div>

                        {/* Última orden */}
                        <div className="flex items-start gap-1.5">
                          <Clock className="size-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                          <div>
                            <span className="text-muted-foreground">{t("lastOrder")}: </span>
                            <span className="text-foreground/80">
                              {s.last_order_at ? relTime(s.last_order_at) : t("noData")}
                            </span>
                          </div>
                        </div>

                        {/* Órdenes 24h */}
                        <div className="flex items-start gap-1.5">
                          <Package className="size-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                          <div>
                            <span className="text-muted-foreground">{t("orders24h")}: </span>
                            <span className="text-foreground/80">{s.orders_last_24h}</span>
                          </div>
                        </div>

                        {/* Sesión */}
                        <div className="flex items-start gap-1.5">
                          <Activity className="size-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                          <div>
                            <span className="text-muted-foreground">{t("session")}: </span>
                            <span className={cn(
                              "text-foreground/80",
                              s.session_state === "ok" && "text-emerald-600 dark:text-emerald-400",
                              s.session_state === "stale" && "text-amber-600 dark:text-amber-400",
                            )}>
                              {t(`sessionState.${s.session_state}`)}
                            </span>
                          </div>
                        </div>

                        {/* Error del healthcheck si falló */}
                        {s.last_healthcheck && !s.last_healthcheck.ok && s.last_healthcheck.summary && (
                          <div className="col-span-2 mt-1 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                            {s.last_healthcheck.summary}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 h-10 animate-pulse rounded-md bg-muted/40" />
                    )}

                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isDisabled}
                        onClick={() => runSmoke(key)}
                        className="h-7 text-[11px]"
                      >
                        {isSmokingThis ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Activity className="size-3" />
                        )}
                        {t("runDiagnostic")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border bg-muted/20 px-5 py-3 flex justify-end">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">{t("close")}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
