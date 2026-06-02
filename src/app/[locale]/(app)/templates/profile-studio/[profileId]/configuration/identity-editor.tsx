"use client";

import { useState } from "react";
import { Building2, FileText, Lock, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { DocumentKind, ReviewProfile } from "../../_lib/types";
import { DOC_KIND_OPTIONS } from "../../_lib/types";

export function ProfileIdentityEditor({ profile }: { profile: ReviewProfile }) {
  const t = useTranslations("templates.profileStudio.configuration");
  const tKinds = useTranslations("templates.profileStudio.kinds");
  const [name, setName] = useState(profile.name);
  const [kind, setKind] = useState<DocumentKind>(profile.document_kind);
  const [description, setDescription] = useState(profile.description ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>, fieldLabel: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/review-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(t("updated", { field: fieldLabel }));
    } catch {
      toast.error(t("updateFailed", { field: fieldLabel.toLowerCase() }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Name */}
        <Field icon={Building2} label={t("name")}>
          <input
            type="text"
            value={name}
            maxLength={120}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              if (!trimmed || trimmed === profile.name) {
                setName(profile.name);
                return;
              }
              void patch({ name: trimmed }, t("name"));
            }}
            className={inputCls}
          />
        </Field>

        {/* Document Kind */}
        <Field icon={Type} label={t("documentKind")} hint={profile.system ? t("documentKindLocked") : t("documentKindHint")}>
          {profile.system ? (
            <div className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 text-sm text-[var(--color-fg-mute)]">
              <Lock size={11} aria-hidden="true" />
              {tKinds(getKindKey(profile.document_kind))}
            </div>
          ) : (
            <select
              value={kind}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.value as DocumentKind;
                setKind(next);
                void patch({ document_kind: next }, t("documentKind"));
              }}
              className={inputCls}
            >
              {DOC_KIND_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {tKinds(opt.key)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Description */}
        <Field icon={FileText} label={t("descriptionField")} className="md:col-span-2 xl:col-span-1">
          <textarea
            value={description}
            disabled={saving}
            placeholder={t("descriptionPlaceholder")}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              const trimmed = description.trim();
              const prev = profile.description ?? "";
              if (trimmed === prev) return;
              void patch({ description: trimmed || null }, t("descriptionField"));
            }}
            rows={3}
            className={cn(inputCls, "h-auto py-2 leading-5")}
          />
        </Field>
      </div>
    </section>
  );
}

function getKindKey(kind: DocumentKind): "purchaseOrder" | "invoice" | "shipping" | "receipt" | "custom" {
  return kind === "purchase_order" ? "purchaseOrder" : kind;
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
