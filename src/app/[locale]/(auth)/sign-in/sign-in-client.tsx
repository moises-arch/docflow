"use client";

import { useRef, useMemo, useState, type FormEvent } from "react";
import { Loader2, Lock, Shield } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";
import { isValidPasscode } from "@/lib/passcodes";
import { AnimatedOTP, type AnimatedOTPHandle } from "@/components/app/animated-otp";
import { AppIcon } from "@/components/app/app-icon";
import { AppLogo } from "@/components/app/app-logo";

function isSafeRedirect(value: string | null, locale: string): value is string {
  return Boolean(
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("/sign-in") &&
    value !== `/${locale}` &&
    value.startsWith(`/${locale}/`),
  );
}

const inputClass = cn(
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)]",
  "bg-[var(--color-bg)] px-3 text-sm text-[var(--color-fg)]",
  "transition-colors duration-[120ms] outline-none",
  "placeholder:text-[var(--color-fg-subtle)]",
  "hover:border-[var(--color-border-hv)]",
  "focus:border-[var(--color-fg)] focus:bg-[var(--color-surface)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

// ── Passcode gate ──────────────────────────────────────────────────────────────

function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations("auth");
  const otpRef = useRef<AnimatedOTPHandle>(null);
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const year = new Date().getFullYear();

  function handlePin(pin: string) {
    if (isValidPasscode(pin)) {
      onUnlock();
    } else {
      setError(true);
      setAttempts(a => a + 1);
      otpRef.current?.shake();
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-[#0d0d0f] px-4 py-8">
      {/* Subtle grid background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(var(--color-fg) 1px, transparent 1px), linear-gradient(90deg, var(--color-fg) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* Top — brand */}
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <AppIcon size={64} className="rounded-2xl shadow-[0_0_32px_rgba(62,207,142,0.15)]" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">DocFlow</h1>
          <p className="mt-0.5 text-sm text-white/40">{t("appTagline")}</p>
        </div>
      </div>

      {/* Center — passcode */}
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <Lock size={20} className="text-white/60" />
          </div>
          <div>
            <p className="font-semibold text-white">{t("passcode.title")}</p>
            <p className="mt-0.5 text-sm text-white/40">{t("passcode.subtitle")}</p>
          </div>
        </div>

        <AnimatedOTP ref={otpRef} length={4} onComplete={handlePin} masked />

        <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ring-1 transition-all duration-200 ${
          error ? "bg-red-500/10 text-red-400 ring-red-500/20" : "bg-transparent text-transparent ring-transparent"
        }`}>
          <Shield size={13} />
          {t("passcode.wrong")}{attempts > 1 ? ` — ${t("passcode.attempt")} ${attempts}` : ""}
        </div>
      </div>

      {/* Bottom — DocFlow + disclaimer */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AppLogo variant="full" className="h-5 w-auto opacity-25" style={{ color: "white" }} />
        <p className="max-w-xs text-[11px] leading-relaxed text-white/25">
          {t("disclaimer")}
        </p>
        <p className="text-[10px] text-white/20">
          {t("copyright").replace("{}", String(year))}
        </p>
      </div>
    </main>
  );
}

// ── Login form ─────────────────────────────────────────────────────────────────

export function SignInClient() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [passcodeOk, setPasscodeOk] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const year = new Date().getFullYear();

  const redirectTo = useMemo(() => {
    const requested = searchParams.get("redirectTo");
    return isSafeRedirect(requested, locale) ? requested : `/${locale}/inbox`;
  }, [locale, searchParams]);

  if (!passcodeOk) {
    return <PasscodeGate onUnlock={() => setPasscodeOk(true)} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(t("errors.invalidCredentials"));
      return;
    }
    window.location.assign(redirectTo);
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-[#0d0d0f] px-4 py-8">
      {/* Grid bg */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(var(--color-fg) 1px, transparent 1px), linear-gradient(90deg, var(--color-fg) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* Top brand */}
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <AppIcon size={64} className="rounded-2xl shadow-[0_0_32px_rgba(62,207,142,0.15)]" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">DocFlow</h1>
          <p className="mt-0.5 text-sm text-white/40">{t("appTagline")}</p>
        </div>
      </div>

      {/* Login form */}
      <div className="w-full max-w-[360px]">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-white">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-white/40">{t("subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">{t("email")}</span>
              <input type="email" autoComplete="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com"
                required disabled={loading}
                className={cn(inputClass, "border-white/10 bg-white/5 text-white placeholder:text-white/20 hover:border-white/20 focus:border-white/40 focus:bg-white/8")}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">{t("password")}</span>
              <input type="password" autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required disabled={loading}
                className={cn(inputClass, "border-white/10 bg-white/5 text-white placeholder:text-white/20 hover:border-white/20 focus:border-white/40 focus:bg-white/8")}
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              className="mt-1 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-white px-4 text-sm font-semibold text-[#0d0d0f] transition-opacity disabled:opacity-50">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? t("signingIn") : t("signIn")}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AppLogo variant="full" className="h-5 w-auto opacity-20" style={{ color: "white" }} />
        <p className="max-w-xs text-[11px] leading-relaxed text-white/20">
          {t("disclaimer")}
        </p>
        <p className="text-[10px] text-white/15">
          {t("copyright").replace("{}", String(year))}
        </p>
      </div>
    </main>
  );
}
