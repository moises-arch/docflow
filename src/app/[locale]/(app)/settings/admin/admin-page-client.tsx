"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import {
  Activity, BrainCircuit, Building2, Lock, RefreshCw,
  Shield, Trash2, Upload, Users, Zap, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AnimatedOTP, type AnimatedOTPHandle } from "@/components/app/animated-otp";
import { AppIcon } from "@/components/app/app-icon";

const ADMIN_PIN = "1987";

interface Props {
  userId: string;
  aiConnection: { provider: string; primary_model: string; status: string; last_checked_at: string | null; last_error: string | null } | null;
  tenant: { name: string; slug: string; locale: string | null; display_tz: string | null; auto_approve_clean: boolean | null } | null;
  memberCount: number;
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-yellow-400";
  return <span className={`inline-block size-1.5 rounded-full ${color}`} />;
}

// ── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm border-b border-[var(--color-border)] last:border-0">
      <span className="text-[var(--color-fg-mute)]">{label}</span>
      <span className={`font-medium text-[var(--color-fg)] ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function AdminCard({ icon: Icon, title, accent = "#818cf8", children }: {
  icon: typeof BrainCircuit;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg" style={{ background: `${accent}20`, color: accent }}>
          <Icon size={15} />
        </div>
        <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Icon upload ───────────────────────────────────────────────────────────────

function IconUploadCard() {
  const tIcon = useTranslations("settings.admin.icon");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(tIcon("invalidType")); return; }
    if (file.size > 512 * 1024) { toast.error(tIcon("tooLarge")); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    // In production: upload to /api/settings/profile/icon or a Vercel KV store
    await new Promise(r => setTimeout(r, 800));
    setUploading(false);
    toast.success(tIcon("success"));
  }

  return (
    <AdminCard icon={ImageIcon} title="App Icon" accent="#3ecf8e">
      <div className="flex items-center gap-5">
        <div className="relative">
          {preview
            ? <div className="relative size-20 rounded-2xl overflow-hidden ring-2 ring-[#3ecf8e]/30"><Image src={preview} alt="Preview" fill className="object-cover" /></div>
            : <AppIcon size={80} className="rounded-2xl ring-2 ring-[#3ecf8e]/20" />
          }
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--color-fg)]">Ícono del sistema</p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
            Usado como favicon, iOS home screen y sidebar. SVG recomendado. Fondo oscuro 1:1.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-3 text-xs font-medium text-[var(--color-bg)] disabled:opacity-50"
            >
              {uploading ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? "Subiendo…" : "Cambiar ícono"}
            </button>
            {preview && (
              <button onClick={() => setPreview(null)} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">
                <Trash2 size={11} /> Restaurar original
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      </div>
    </AdminCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminPageClient({ aiConnection, tenant, memberCount }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const otpRef = useRef<AnimatedOTPHandle>(null);

  function handlePin(pin: string) {
    if (pin === ADMIN_PIN) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setAttempts(a => a + 1);
      otpRef.current?.shake();
    }
  }

  // ── PIN gate ────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
            <Lock size={24} className="text-[var(--color-fg-mute)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-fg)]">Área restringida</h1>
            <p className="mt-1 text-sm text-[var(--color-fg-mute)]">Ingresá el PIN de administrador para continuar.</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <AnimatedOTP
            ref={otpRef}
            length={4}
            onComplete={handlePin}
            masked
          />

          {pinError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
              <Shield size={14} />
              PIN incorrecto{attempts > 1 ? ` — intento ${attempts}` : ""}
            </div>
          )}

          <p className="text-xs text-[var(--color-fg-subtle)]">Este PIN no se guarda ni se transmite.</p>
        </div>
      </div>
    );
  }

  // ── Admin content ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-fg)]">
            <Zap size={18} className="text-yellow-400" />
            Panel de Administración
          </h1>
          <p className="mt-0.5 text-sm text-[var(--color-fg-mute)]">Configuración avanzada del sistema DocFlow.</p>
        </div>
        <button onClick={() => setUnlocked(false)}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">
          <Lock size={11} /> Cerrar sesión admin
        </button>
      </div>

      {/* Grid */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* App icon */}
        <div className="lg:col-span-2">
          <IconUploadCard />
        </div>

        {/* AI */}
        <AdminCard icon={BrainCircuit} title="Modelo de IA" accent="#f59e0b">
          {aiConnection ? (
            <div className="space-y-1">
              <InfoRow label="Proveedor" value={aiConnection.provider} />
              <InfoRow label="Modelo" value={aiConnection.primary_model} mono />
              <InfoRow label="Estado" value={
                <span className="flex items-center gap-1.5">
                  <StatusDot status={aiConnection.status} />
                  {aiConnection.status}
                </span> as unknown as string
              } />
              {aiConnection.last_checked_at && (
                <InfoRow label="Última verificación"
                  value={new Date(aiConnection.last_checked_at).toLocaleString("es")} />
              )}
              {aiConnection.last_error && (
                <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs text-red-400 ring-1 ring-red-500/20">
                  Error: {aiConnection.last_error}
                </div>
              )}
              <div className="pt-3">
                <a href="../ai" className="text-xs text-[var(--color-fg-mute)] underline underline-offset-2 hover:text-[var(--color-fg)]">
                  Editar conexión →
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <BrainCircuit size={28} className="text-[var(--color-fg-subtle)]" />
              <p className="text-sm text-[var(--color-fg-mute)]">Sin conexión AI configurada.</p>
              <a href="../ai" className="text-xs text-[var(--color-fg-mute)] underline underline-offset-2 hover:text-[var(--color-fg)]">
                Configurar →
              </a>
            </div>
          )}
        </AdminCard>

        {/* Tenant */}
        <AdminCard icon={Building2} title="Tenant" accent="#818cf8">
          {tenant ? (
            <div>
              <InfoRow label="Nombre" value={tenant.name} />
              <InfoRow label="Slug" value={tenant.slug} mono />
              <InfoRow label="Locale" value={tenant.locale ?? "—"} />
              <InfoRow label="Zona horaria" value={tenant.display_tz ?? "—"} />
              <InfoRow label="Auto-approve"
                value={tenant.auto_approve_clean ? "Activado" : "Desactivado"} />
            </div>
          ) : (
            <p className="text-sm text-[var(--color-fg-mute)]">Sin datos de tenant.</p>
          )}
        </AdminCard>

        {/* Users */}
        <AdminCard icon={Users} title="Equipo" accent="#34d399">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-[var(--color-fg)]">{memberCount}</p>
              <p className="text-xs text-[var(--color-fg-mute)]">miembro{memberCount !== 1 ? "s" : ""} activo{memberCount !== 1 ? "s" : ""}</p>
            </div>
            <a href="../team"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]">
              Gestionar →
            </a>
          </div>
        </AdminCard>

        {/* Diagnostics */}
        <AdminCard icon={Activity} title="Diagnósticos" accent="#60a5fa">
          <p className="mb-3 text-xs text-[var(--color-fg-mute)]">
            Ejecutá los 59 smoke tests para verificar el estado completo del sistema.
          </p>
          <a href="../diagnostics"
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-3 text-xs font-medium text-[var(--color-bg)]">
            <Activity size={12} /> Ir a Diagnósticos
          </a>
        </AdminCard>

      </div>
    </div>
  );
}
