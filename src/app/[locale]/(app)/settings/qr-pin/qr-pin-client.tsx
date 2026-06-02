"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  hasPin: boolean;
  updatedAt: string | null;
}

export function QrPinSettingsClient({ hasPin: initialHas, updatedAt: initialUpdated }: Props) {
  const [hasPin, setHasPin] = useState(initialHas);
  const [updatedAt, setUpdatedAt] = useState(initialUpdated);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function savePin() {
    if (!/^\d{4}$/.test(pin)) {
      toast.error("El PIN debe tener 4 dígitos");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("Los PINs no coinciden");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/scan-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(j.detail ?? "No se pudo guardar");
      }
      setHasPin(true);
      setUpdatedAt(new Date().toISOString());
      setPin("");
      setConfirmPin("");
      toast.success("PIN guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falló");
    } finally {
      setSaving(false);
    }
  }

  async function clearPin() {
    if (!confirm("¿Eliminar el PIN? Cualquiera con el QR podrá subir sin restricción.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/settings/scan-pin", { method: "DELETE" });
      if (!res.ok) throw new Error("Falló");
      setHasPin(false);
      setUpdatedAt(null);
      toast.success("PIN eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falló");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <KeyRound size={18} strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            PIN del QR mobile
          </h1>
          <p className="text-[12.5px] text-muted-foreground">
            Protege quién puede subir órdenes desde el QR impreso.
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        {hasPin ? (
          <>
            <ShieldCheck className="size-5 text-emerald-600" strokeWidth={1.8} />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                PIN activo
              </p>
              <p className="text-[11px] text-muted-foreground">
                Actualizado {updatedAt ? new Date(updatedAt).toLocaleString() : "—"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={clearing}
              onClick={clearPin}
              className="text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              {clearing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldOff size={13} />}
              Eliminar
            </Button>
          </>
        ) : (
          <>
            <ShieldOff className="size-5 text-zinc-400" strokeWidth={1.8} />
            <div>
              <p className="text-[13px] font-medium">Sin PIN</p>
              <p className="text-[11px] text-muted-foreground">
                Cualquiera con el QR puede subir órdenes.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Form */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {hasPin ? "Cambiar PIN" : "Crear PIN"}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-[11.5px] font-medium text-zinc-700 dark:text-zinc-300">
              Nuevo PIN (4 dígitos)
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="h-11 rounded-lg border border-input bg-background px-4 font-mono text-[16px] tracking-[0.4em] text-center outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11.5px] font-medium text-zinc-700 dark:text-zinc-300">
              Confirmar PIN
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="h-11 rounded-lg border border-input bg-background px-4 font-mono text-[16px] tracking-[0.4em] text-center outline-none focus:border-zinc-900 dark:focus:border-zinc-100"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[10.5px] text-muted-foreground">
            Compartilo solo con quien deba subir documentos. Lo podés cambiar cuando quieras.
          </p>
          <Button
            disabled={saving || pin.length !== 4 || confirmPin.length !== 4}
            onClick={savePin}
            className="bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? "Guardando…" : "Guardar PIN"}
          </Button>
        </div>
      </div>
    </div>
  );
}
