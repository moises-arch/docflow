"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Upload, CheckSquare, CheckCircle2, RefreshCw,
  ChevronRight, X, AlertTriangle, Zap, Database,
  FileText, Bot, ArrowRight, ShieldCheck, Timer,
} from "lucide-react";

type StageId = "upload" | "split" | "extract" | "template" | "review" | "sync";

interface StageVisual {
  id: StageId;
  icon: React.ElementType;
  color: string;
  bg: string;
  borderColor: string;
  outputCount: number;
  hasFail: boolean;
  stepCount: 4 | 5;
}

const STAGE_VISUALS: StageVisual[] = [
  { id: "upload", icon: Upload, color: "text-sky-400", bg: "bg-sky-500/10", borderColor: "border-sky-500/30", outputCount: 2, hasFail: false, stepCount: 4 },
  { id: "split", icon: FileText, color: "text-violet-400", bg: "bg-violet-500/10", borderColor: "border-violet-500/30", outputCount: 2, hasFail: false, stepCount: 4 },
  { id: "extract", icon: Bot, color: "text-amber-400", bg: "bg-amber-500/10", borderColor: "border-amber-500/30", outputCount: 3, hasFail: true, stepCount: 4 },
  { id: "template", icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/30", outputCount: 2, hasFail: false, stepCount: 4 },
  { id: "review", icon: CheckSquare, color: "text-blue-400", bg: "bg-blue-500/10", borderColor: "border-blue-500/30", outputCount: 3, hasFail: false, stepCount: 5 },
  { id: "sync", icon: RefreshCw, color: "text-rose-400", bg: "bg-rose-500/10", borderColor: "border-rose-500/30", outputCount: 3, hasFail: true, stepCount: 5 },
];

const STATE_FLOW = [
  { state: "uploaded", color: "bg-slate-400" },
  { state: "processing", color: "bg-blue-400" },
  { state: "needs_review", color: "bg-amber-400" },
  { state: "reviewed", color: "bg-emerald-400" },
  { state: "synced", color: "bg-emerald-500" },
];

export function PipelineInteractive() {
  const t = useTranslations("help.pipeline_page");
  const [active, setActive] = useState<StageId | null>(null);
  const [autoSync, setAutoSync] = useState(true);

  return (
    <div className="not-prose my-8 space-y-8">
      {/* Auto-sync toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("autosync.label")}</p>
          <p className="text-xs text-muted-foreground">
            {autoSync ? t("autosync.onDesc") : t("autosync.offDesc")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoSync}
          onClick={() => setAutoSync((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            autoSync ? "bg-emerald-500" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
              autoSync ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Pipeline stages */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute left-7 top-10 bottom-10 w-0.5 bg-gradient-to-b from-sky-500/30 via-amber-500/30 to-rose-500/30"
        />

        <div className="space-y-3">
          {STAGE_VISUALS.map((stage, idx) => {
            const isReview = stage.id === "review";
            const Icon = stage.icon;
            const isActive = active === stage.id;
            const isAutoSkipped = isReview && autoSync;

            return (
              <div key={stage.id}>
                <button
                  type="button"
                  onClick={() => setActive(isActive ? null : stage.id)}
                  className={`group relative flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                    isActive
                      ? `${stage.borderColor} bg-card shadow-md`
                      : "border-border bg-card/60 hover:border-border hover:bg-card hover:shadow-sm"
                  }`}
                >
                  <div className={`relative flex size-9 shrink-0 items-center justify-center rounded-xl ${stage.bg} border ${stage.borderColor}`}>
                    <Icon size={16} className={stage.color} />
                    <span className="absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-background border border-border text-[9px] font-bold text-muted-foreground">
                      {idx + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {t(`stages.${stage.id}.label`)}
                      </span>
                      {isAutoSkipped && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Zap size={9} />
                          {t("autosync.autoBadge")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`stages.${stage.id}.sublabel`)}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                      <Timer size={10} />
                      {t(`stages.${stage.id}.duration`)}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60">
                      {t(`stages.${stage.id}.actor`)}
                    </div>
                  </div>

                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-muted-foreground/40 transition-transform ${isActive ? "rotate-90" : ""}`}
                  />
                </button>

                {isActive && (
                  <div className={`mx-4 rounded-b-xl border border-t-0 ${stage.borderColor} bg-gradient-to-b from-card to-muted/20 p-5`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="text-sm text-foreground/85 leading-relaxed">
                        {t(`stages.${stage.id}.what`)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActive(null)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("labels.howItWorks")}
                        </p>
                        <ol className="space-y-1.5">
                          {Array.from({ length: stage.stepCount }).map((_, i) => {
                            const stepKey = `stages.${stage.id}.step${i + 1}`;
                            return (
                              <li key={stepKey} className="flex gap-2 text-xs text-foreground/80">
                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                                  {i + 1}
                                </span>
                                {t(stepKey)}
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t("labels.outputs")}
                          </p>
                          <ul className="space-y-1">
                            {Array.from({ length: stage.outputCount }).map((_, i) => {
                              const outKey = `stages.${stage.id}.out${i + 1}`;
                              return (
                                <li key={outKey} className="flex items-center gap-1.5 text-xs text-foreground/80">
                                  <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />
                                  <code className="font-mono text-[11px]">{t(outKey)}</code>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        {stage.hasFail && (
                          <div className="rounded-lg border border-rose-200/50 bg-rose-50 p-2.5 dark:border-rose-800/30 dark:bg-rose-950/20">
                            <p className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                              <span>
                                <strong>{t("labels.ifFails")}</strong> {t(`stages.${stage.id}.fail`)}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {idx < STAGE_VISUALS.length - 1 && (
                  <div className="ml-7 flex items-center py-1">
                    <ArrowRight size={12} className="text-muted-foreground/30 ml-1.5" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* State machine */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("labels.lifecycleTitle")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {STATE_FLOW.map((s, i) => (
            <div key={s.state} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
                <div className={`size-2 rounded-full ${s.color}`} />
                <span className="font-mono text-[11px] text-foreground/80">{s.state}</span>
              </div>
              {i < STATE_FLOW.length - 1 && (
                <ArrowRight size={11} className="text-muted-foreground/40 shrink-0" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        <p
          className="mt-3 text-[11px] text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: t.raw("labels.lifecycleNote") as string }}
        />
      </div>

      {/* Cost indicator */}
      <div className="grid gap-3 sm:grid-cols-3">
        <CostCard label={t("costs.perDoc")} value="$0.01–$0.05" Icon={FileText} color="text-emerald-500" />
        <CostCard label={t("costs.splitExtract")} value="$0.03–$0.10" Icon={Bot} color="text-amber-500" />
        <CostCard label={t("costs.odooSync")} value={t("costs.free")} Icon={Database} color="text-blue-500" />
      </div>
    </div>
  );
}

function CostCard({ label, value, Icon, color }: { label: string; value: string; Icon: React.ElementType; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Icon size={18} className={`shrink-0 ${color}`} />
      <div>
        <p className="text-base font-bold text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
