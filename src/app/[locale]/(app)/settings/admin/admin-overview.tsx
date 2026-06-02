"use client";

import Image from "next/image";
import { Activity, BrainCircuit, Building2, ImageIcon, Lock, RefreshCw, Server, Trash2, Upload, Users, Zap } from "lucide-react";
import { PasscodeManager } from "./passcode-manager";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AppIcon } from "@/components/app/app-icon";
import { BrowserEngineBadge } from "@/components/app/browser-engine-badge";
import type { BrowserMode } from "@/lib/browser-mode";

interface Props {
  userId: string;
  aiConnection: { provider: string; primary_model: string; status: string; last_checked_at: string | null; last_error: string | null } | null;
  tenant: { name: string; slug: string; locale: string | null; display_tz: string | null; auto_approve_clean: boolean | null } | null;
  memberCount: number;
  browserMode: BrowserMode;
}

function StatusDot({ status }: { status: string }) {
  const c = status === "active" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-yellow-400";
  return <span className={`inline-block size-1.5 rounded-full ${c}`} />;
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2.5 text-sm last:border-0">
      <span className="text-[var(--color-fg-mute)]">{label}</span>
      <span className={`font-medium text-[var(--color-fg)] ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function Card({ icon: Icon, title, accent = "#818cf8", children, action }: {
  icon: typeof BrainCircuit; title: string; accent?: string;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg" style={{ background: `${accent}20`, color: accent }}>
            <Icon size={13} />
          </div>
          <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function IconUploadCard() {
  const t = useTranslations("settings.admin.icon");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(t("invalidType")); return; }
    if (file.size > 512 * 1024) { toast.error(t("tooLarge")); return; }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    await new Promise(r => setTimeout(r, 600));
    setLoading(false);
    toast.success(t("success"));
  }

  return (
    <Card icon={ImageIcon} title={t("title")} accent="#3ecf8e"
      action={
        <div className="flex gap-2">
          <button onClick={() => ref.current?.click()} disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-2.5 text-[11px] font-medium text-[var(--color-bg)] disabled:opacity-50">
            {loading ? <RefreshCw size={10} className="animate-spin" /> : <Upload size={10} />}
            {loading ? t("uploading") : t("change")}
          </button>
          {preview && (
            <button onClick={() => setPreview(null)}
              className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-[11px] text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">
              <Trash2 size={10} /> {t("restore")}
            </button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          {preview
            ? <div className="relative size-16 rounded-xl overflow-hidden ring-2 ring-[#3ecf8e]/30"><Image src={preview} alt="Preview" fill className="object-cover" /></div>
            : <AppIcon size={64} className="rounded-xl ring-2 ring-[#3ecf8e]/20" />}
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--color-fg)]">{t("officialLabel")}</p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("description")}</p>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
    </Card>
  );
}

export function AdminOverview({ aiConnection, tenant, memberCount, browserMode }: Props) {
  const t = useTranslations("settings.admin");
  const tAi = useTranslations("settings.admin.ai");
  const tTenant = useTranslations("settings.admin.tenant");
  const tTeam = useTranslations("settings.admin.team");
  const tDiag = useTranslations("settings.admin.diagnostics");
  const [locked, setLocked] = useState(false);

  if (locked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-[var(--color-fg-mute)]">{t("sessionLocked")}</p>
      </div>
    );
  }

  const memberLabel = memberCount === 1 ? tTeam("member") : tTeam("members");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-fg)]">
            <Zap size={17} className="text-yellow-400" />
            {t("heading")}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-fg-mute)]">{t("subheading")}</p>
        </div>
        <button onClick={() => setLocked(true)}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">
          <Lock size={11} /> {t("lockSession")}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2"><IconUploadCard /></div>
        <div className="lg:col-span-2"><PasscodeManager /></div>

        <Card icon={BrainCircuit} title={tAi("title")} accent="#f59e0b"
          action={<a href="ai" className="text-xs text-[var(--color-fg-subtle)] underline underline-offset-2 hover:text-[var(--color-fg-mute)]">{tAi("edit")}</a>}>
          {aiConnection ? (
            <>
              <Row label={tAi("provider")} value={aiConnection.provider} />
              <Row label={tAi("model")} value={aiConnection.primary_model} mono />
              <Row label={tAi("status")} value={<span className="flex items-center gap-1.5"><StatusDot status={aiConnection.status} />{aiConnection.status}</span>} />
              {aiConnection.last_error && (
                <div className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-400 ring-1 ring-red-500/20">
                  {aiConnection.last_error}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--color-fg-mute)]">
              {tAi("notConfigured")} <a href="ai" className="underline">{tAi("configure")}</a>
            </p>
          )}
        </Card>

        <Card icon={Building2} title={tTenant("title")} accent="#818cf8">
          {tenant ? (
            <>
              <Row label={tTenant("name")} value={tenant.name} />
              <Row label={tTenant("slug")} value={tenant.slug} mono />
              <Row label={tTenant("locale")} value={tenant.locale ?? "—"} />
              <Row label={tTenant("autoApprove")} value={tenant.auto_approve_clean ? tTenant("enabled") : tTenant("disabled")} />
            </>
          ) : <p className="text-sm text-[var(--color-fg-mute)]">{tTenant("noData")}</p>}
        </Card>

        <Card icon={Users} title={tTeam("title")} accent="#34d399"
          action={<a href="team" className="text-xs text-[var(--color-fg-subtle)] underline underline-offset-2 hover:text-[var(--color-fg-mute)]">{tTeam("manage")}</a>}>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-[var(--color-fg)]">{memberCount}</span>
            <span className="mb-1 text-sm text-[var(--color-fg-mute)]">{memberLabel}</span>
          </div>
        </Card>

        <Card icon={Activity} title={tDiag("title")} accent="#60a5fa"
          action={<a href="diagnostics" className="text-xs text-[var(--color-fg-subtle)] underline underline-offset-2 hover:text-[var(--color-fg-mute)]">{tDiag("open")}</a>}>
          <p className="text-xs text-[var(--color-fg-mute)]">{tDiag("description")}</p>
          <a href="diagnostics" className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-3 text-xs font-medium text-[var(--color-bg)]">
            <Activity size={12} /> {tDiag("runButton")}
          </a>
        </Card>

        {/* Motor de navegador usado por los runners de scraping (Supplier Portal/Supplier Portal) */}
        <div className="lg:col-span-2">
          <Card icon={Server} title="Motor de navegador" accent="#10b981">
            <p className="mb-3 text-xs text-[var(--color-fg-mute)]">
              Navegador que usan los runners de Supplier Portal y Supplier Portal para descargar las órdenes.
            </p>
            <Row
              label="Modo"
              value={browserMode.remote ? "VPS remoto (Browserless)" : "Serverless (Vercel)"}
            />
            <Row label="Host" value={browserMode.host ?? "—"} mono />
            <Row
              label="Estado"
              value={
                <span className="flex items-center gap-1.5">
                  <StatusDot status={browserMode.remote ? "active" : "pending"} />
                  {browserMode.remote ? "Remoto activo" : "Empaquetado"}
                </span>
              }
            />
            <div className="mt-3">
              <BrowserEngineBadge remote={browserMode.remote} host={browserMode.host} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
