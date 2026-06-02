"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

interface Props {
  token: string;
}

export function PinGate({ token }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const setDigit = (idx: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
    if (v && idx < 3) inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (text.length === 0) return;
    e.preventDefault();
    const next = ["", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    inputs.current[Math.min(text.length, 3)]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
    if (e.key === "Enter") {
      void submit();
    }
  };

  const submit = useCallback(async () => {
    const pin = digits.join("");
    if (pin.length !== 4) {
      setError("Ingresá los 4 dígitos");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan/${token}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        // Refresh so the server component re-evaluates the cookie.
        window.location.reload();
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
      if (res.status === 429) {
        setError("Demasiados intentos. Esperá un rato.");
      } else if (res.status === 401) {
        setError(j.detail ?? "PIN incorrecto");
      } else {
        setError(j.detail ?? j.error ?? "No se pudo verificar");
      }
      setDigits(["", "", "", ""]);
      inputs.current[0]?.focus();
    } catch {
      setError("Sin conexión");
    } finally {
      setSubmitting(false);
    }
  }, [digits, token]);

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (digits.every((d) => d !== "") && !submitting) {
      void submit();
    }
  }, [digits, submit, submitting]);

  const filled = digits.filter(Boolean).length;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-zinc-50 text-zinc-900">
      {/* Subtle mesh background — single tinted blob, no neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 20% 0%, rgba(16,185,129,0.12), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(24,24,27,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-12 pt-[max(env(safe-area-inset-top),20px)]">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="size-2 rounded-full bg-emerald-500 [animation:pulse_2.4s_ease-in-out_infinite]" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-zinc-500 uppercase">
            DocFlow · DocFlow
          </span>
        </div>

        {/* Heading */}
        <div className="mt-16">
          <h1 className="text-[34px] font-semibold tracking-tight leading-[1.05] text-zinc-950">
            Acceso protegido
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-zinc-600 max-w-[28ch]">
            Ingresá los 4 dígitos del equipo para empezar a subir órdenes.
          </p>
        </div>

        {/* PIN slots */}
        <div className="mt-10">
          <div className="flex items-center justify-between gap-3">
            {[0, 1, 2, 3].map((idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputs.current[idx] = el;
                }}
                inputMode="numeric"
                pattern="\d*"
                autoComplete="one-time-code"
                maxLength={1}
                value={digits[idx]}
                onChange={(e) => setDigit(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={submitting}
                className={`
                  h-[68px] w-[68px] rounded-2xl border bg-white text-center
                  font-mono text-[28px] font-semibold tabular-nums text-zinc-950
                  transition-all duration-200 outline-none
                  ${
                    digits[idx]
                      ? "border-zinc-900 shadow-[0_0_0_3px_rgba(24,24,27,0.06)]"
                      : "border-zinc-200"
                  }
                  focus:border-zinc-900 focus:shadow-[0_0_0_3px_rgba(24,24,27,0.06)]
                  disabled:opacity-50
                `}
                aria-label={`Dígito ${idx + 1}`}
              />
            ))}
          </div>

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i < filled ? "w-6 bg-emerald-500" : "w-3 bg-zinc-300"
                }`}
              />
            ))}
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 text-center text-[12.5px] font-medium text-rose-700"
            >
              {error}
            </p>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Submit (auto-submits at 4 digits; this is fallback / status) */}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || filled !== 4}
          className="
            group relative flex items-center justify-center gap-2 rounded-2xl
            bg-zinc-950 px-5 py-4 text-[14px] font-semibold text-white
            shadow-[0_8px_24px_-12px_rgba(24,24,27,0.5)]
            transition-all duration-200
            hover:bg-zinc-800 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verificando…
            </>
          ) : (
            <>
              Continuar
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <p className="mt-5 text-center text-[11px] text-zinc-500">
          Si no tenés el PIN, pedíselo a tu supervisor.
        </p>
      </div>
    </div>
  );
}
