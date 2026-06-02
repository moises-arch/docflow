"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addPasscode, getPasscodes, removePasscode } from "@/lib/passcodes";

const MASTER = "1987";

export function PasscodeManager() {
  const t = useTranslations("settings.admin.passcodes");
  const [codes, setCodes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCodes(getPasscodes());
  }, []);

  function handleAdd() {
    if (!/^\d{4}$/.test(input)) { toast.error(t("errorFormat")); return; }
    setAdding(true);
    try {
      addPasscode(input);
      setCodes(getPasscodes());
      setInput("");
      toast.success(t("successAdd"));
      inputRef.current?.focus();
    } finally {
      setAdding(false);
    }
  }

  function handleRemove(code: string) {
    removePasscode(code);
    setCodes(getPasscodes());
    toast.success(t("successRemove"));
  }

  const extra = codes.filter(c => c !== MASTER);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
          <KeyRound size={14} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--color-fg)]">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">{t("description")}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Add form */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4}
            value={input} onChange={e => setInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder={t("placeholder")}
            className="h-9 w-36 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-sm text-[var(--color-fg)] outline-none transition-colors focus:border-[var(--color-fg)]"
          />
          <button
            onClick={handleAdd} disabled={adding || input.length !== 4}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-3 text-sm font-medium text-[var(--color-bg)] disabled:opacity-40"
          >
            <Plus size={13} />
            {adding ? t("adding") : t("add")}
          </button>
        </div>

        {/* Code list */}
        <div className="space-y-1.5">
          {/* Master code */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold tracking-widest text-[var(--color-fg)]">
                ● ● ● ●
              </span>
              <span className="rounded-full bg-[color:var(--color-blue)]/10 px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-blue)]">
                {t("master")}
              </span>
            </div>
          </div>

          {extra.length === 0 ? (
            <p className="px-1 text-xs text-[var(--color-fg-subtle)]">{t("empty")}</p>
          ) : (
            extra.map(code => (
              <div key={code} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
                <span className="font-mono text-sm font-semibold tracking-widest text-[var(--color-fg)]">
                  {code}
                </span>
                <button
                  onClick={() => handleRemove(code)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-fg-mute)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={11} /> {t("remove")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
