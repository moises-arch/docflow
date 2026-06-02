"use client";

import { useState } from "react";
import { AtSign, Building2, Coins, Globe2, KeyRound, Lock, Mail, Plus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type ProviderShape = {
  id: string;
  name: string;
  code: string;
  status: string;
  default_currency: string | null;
  email_domains: string[];
  settings?: Record<string, unknown> | null;
};

const CURRENCY_OPTIONS = ["USD", "EUR", "MXN", "CAD", "GBP"];

export function IdentityEditor({ provider }: { provider: ProviderShape }) {
  const t = useTranslations("settings.providers.configuration");
  const [state, setState] = useState({
    name: provider.name,
    default_currency: provider.default_currency ?? "",
    email_domains: [...provider.email_domains],
    contact_email:
      typeof provider.settings?.contact_email === "string" ? provider.settings.contact_email : "",
    website:
      typeof provider.settings?.website === "string" ? provider.settings.website : "",
  });
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>, field: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(t("updated", { field }));
    } catch {
      toast.error(t("updateFailed", { field: field.toLowerCase() }));
    } finally {
      setSaving(false);
    }
  }

  function mergeSettings(patch: Record<string, unknown>) {
    return { ...(provider.settings ?? {}), ...patch };
  }

  return (
    <section>
      <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-fg-subtle)] uppercase">
        {t("sectionTitle")}
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field icon={Building2} label={t("fieldName")}>
          <input
            type="text"
            value={state.name}
            maxLength={120}
            disabled={saving}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            onBlur={() => {
              const trimmed = state.name.trim();
              if (!trimmed || trimmed === provider.name) {
                setState((s) => ({ ...s, name: provider.name }));
                return;
              }
              void patch({ name: trimmed }, t("fieldName"));
            }}
            className={inputCls}
          />
        </Field>

        <Field icon={KeyRound} label={t("fieldCode")} hint={t("fieldCodeHint")}>
          <div className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 font-mono text-sm text-[var(--color-fg-mute)]">
            <Lock size={11} aria-hidden="true" />
            {provider.code}
          </div>
        </Field>

        <Field icon={Coins} label={t("fieldCurrency")}>
          <select
            value={state.default_currency}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value;
              setState((s) => ({ ...s, default_currency: next }));
              void patch({ default_currency: next }, t("fieldCurrency"));
            }}
            className={inputCls}
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field icon={AtSign} label={t("fieldDomains")} className="md:col-span-2">
          <ChipEditor
            values={state.email_domains}
            placeholder={t("fieldDomainPlaceholder")}
            emptyLabel={t("noDomains")}
            addLabel={t("addButton")}
            disabled={saving}
            normalize={(v) => v.trim().toLowerCase().replace(/\s+/g, "")}
            onChange={(next) => {
              setState((s) => ({ ...s, email_domains: next }));
              void patch({ email_domains: next }, t("fieldDomains"));
            }}
          />
        </Field>

        <Field icon={Mail} label={t("fieldContactEmail")}>
          <input
            type="email"
            value={state.contact_email}
            disabled={saving}
            placeholder="orders@example.com"
            onChange={(e) => setState((s) => ({ ...s, contact_email: e.target.value }))}
            onBlur={() => {
              const trimmed = state.contact_email.trim();
              const prev =
                typeof provider.settings?.contact_email === "string"
                  ? provider.settings.contact_email : "";
              if (trimmed === prev) return;
              void patch(
                { settings: mergeSettings({ contact_email: trimmed || null }) },
                t("fieldContactEmail"),
              );
            }}
            className={inputCls}
          />
        </Field>

        <Field icon={Globe2} label={t("fieldWebsite")}>
          <input
            type="url"
            value={state.website}
            disabled={saving}
            placeholder="https://example.com"
            onChange={(e) => setState((s) => ({ ...s, website: e.target.value }))}
            onBlur={() => {
              const trimmed = state.website.trim();
              const prev =
                typeof provider.settings?.website === "string" ? provider.settings.website : "";
              if (trimmed === prev) return;
              void patch(
                { settings: mergeSettings({ website: trimmed || null }) },
                t("fieldWebsite"),
              );
            }}
            className={inputCls}
          />
        </Field>
      </div>
    </section>
  );
}

const inputCls = cn(
  "h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]",
  "px-2.5 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]",
  "focus:border-[var(--color-fg)] transition-colors disabled:opacity-60",
);

function Field({
  icon: Icon, label, hint, children, className,
}: {
  icon: LucideIcon; label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4", className)}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)]">
          <Icon size={12} aria-hidden="true" />
        </span>
        <label className="text-xs font-medium text-[var(--color-fg-mute)]">{label}</label>
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">{hint}</p>}
    </div>
  );
}

function ChipEditor({
  values, onChange, placeholder, emptyLabel, addLabel, normalize, disabled,
}: {
  values: string[]; onChange: (next: string[]) => void;
  placeholder: string; emptyLabel: string; addLabel: string;
  normalize: (v: string) => string; disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  function add() {
    const v = normalize(input);
    if (!v || values.includes(v)) { setInput(""); return; }
    setInput("");
    onChange([...values, v]);
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-xs italic text-[var(--color-fg-subtle)]">{emptyLabel}</span>
        )}
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-surface-mute)] px-2 py-0.5 text-xs text-[var(--color-fg)]">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} disabled={disabled} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] disabled:opacity-40">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={input} disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} className={inputCls}
        />
        <button
          type="button" onClick={add}
          disabled={disabled || !normalize(input)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]",
            "bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-fg)] transition-colors",
            "hover:bg-[var(--color-surface-mute)] disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <Plus size={12} />{addLabel}
        </button>
      </div>
    </div>
  );
}
