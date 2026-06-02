"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Lock, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatedOTP, type AnimatedOTPHandle } from "@/components/app/animated-otp";

import { isValidPasscode } from "@/lib/passcodes";

interface AdminCtx { unlock: () => void; }
const AdminContext = createContext<AdminCtx | null>(null);
export function useAdminContext() { return useContext(AdminContext); }

export function AdminGate({ children }: { children: ReactNode }) {
  const t = useTranslations("settings.admin.gate");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const otpRef = useRef<AnimatedOTPHandle>(null);

  function handlePin(pin: string) {
    if (isValidPasscode(pin)) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setAttempts(a => a + 1);
      otpRef.current?.shake();
    }
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex size-[72px] items-center justify-center rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-sm">
            <Lock size={26} className="text-[var(--color-fg-mute)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-fg)]">{t("title")}</h1>
            <p className="mt-1.5 text-sm text-[var(--color-fg-mute)]">{t("subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-5">
          <AnimatedOTP ref={otpRef} length={4} onComplete={handlePin} masked />

          <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ring-1 transition-all duration-200 ${
            error
              ? "bg-red-500/10 text-red-400 ring-red-500/20"
              : "bg-transparent text-transparent ring-transparent"
          }`}>
            <Shield size={13} />
            {t("wrongPin")}{attempts > 1 ? ` — ${t("attempt")} ${attempts}` : ""}
          </div>

          <p className="text-[11px] text-[var(--color-fg-subtle)]">{t("pinNote")}</p>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ unlock: () => setUnlocked(false) }}>
      {children}
    </AdminContext.Provider>
  );
}
