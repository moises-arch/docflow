"use client";

import { useState } from "react";
import { Plus, X, Tags } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface AliasesEditorProps {
  providerId: string;
  initialAliases: string[];
}

export function AliasesEditor({ providerId, initialAliases }: AliasesEditorProps) {
  const t = useTranslations("settings.providers.aliases");
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { aliases: next } }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setAliases(next);
      toast.success(t("updated"));
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || aliases.includes(trimmed)) {
      setInput("");
      return;
    }
    const next = [...aliases, trimmed];
    setInput("");
    void save(next);
  }

  function remove(alias: string) {
    const next = aliases.filter((a) => a !== alias);
    void save(next);
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
        <Tags size={15} />
      </div>
      <p className="text-xs font-medium tracking-wide text-[var(--color-fg-subtle)] uppercase">
        {t("title")}
      </p>
      <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
        {t("description")}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {aliases.length === 0 && (
          <span className="text-xs text-[var(--color-fg-subtle)] italic">{t("empty")}</span>
        )}
        {aliases.map((alias) => (
          <span
            key={alias}
            className="inline-flex items-center gap-1 rounded-md bg-[var(--color-surface-mute)] px-2 py-1 text-xs text-[var(--color-fg)]"
          >
            {alias}
            <button
              type="button"
              onClick={() => remove(alias)}
              disabled={saving}
              className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-40"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={t("placeholder")}
          className={cn(
            "h-8 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]",
            "px-2.5 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]",
            "focus:border-[var(--color-fg)] transition-colors",
          )}
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !input.trim()}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]",
            "bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-fg)] transition-colors",
            "hover:bg-[var(--color-surface-mute)] disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <Plus size={13} />
          {t("add")}
        </button>
      </div>
    </div>
  );
}
