"use client";

import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import type { FieldMapping, TargetField } from "../../types";

type Props = {
  providerId: string;
  targetFields: TargetField[];
  mappings: FieldMapping[];
};

type SourceField = { key: string; label: string };

export function SourceTargetClient({ providerId, targetFields, mappings }: Props) {
  const router = useRouter();
  const t = useTranslations("settings.providers");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewField, setShowNewField] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");

  const mappingsByTarget = useMemo(
    () => new Map(mappings.map((m) => [m.target_field_id, m])),
    [mappings],
  );

  const sourceFields = useMemo<SourceField[]>(() => {
    const fields = new Map<string, SourceField>();
    for (const m of mappings) {
      fields.set(m.source_field_key, {
        key: m.source_field_key,
        label: m.source_field_label || m.source_field_key,
      });
    }
    return Array.from(fields.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [mappings]);

  // Group target fields by scope
  const grouped = useMemo(() => {
    const groups = new Map<string, TargetField[]>();
    for (const f of targetFields) {
      const scope = f.scope ?? "other";
      if (!groups.has(scope)) groups.set(scope, []);
      groups.get(scope)!.push(f);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [targetFields]);

  const filteredSource = sourceFields.filter((f) =>
    [f.key, f.label].join(" ").toLowerCase().includes(sourceQuery.toLowerCase()),
  );

  async function createMapping(targetField: TargetField, sourceKey: string, sourceLabel: string) {
    if (!sourceKey) return;
    setBusyId(targetField.id);
    try {
      const res = await fetch("/api/settings/providers/field-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          target_field_id: targetField.id,
          source_field_key: sourceKey,
          source_field_label: sourceLabel || sourceKey,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("fieldMappings.created"));
      router.refresh();
    } catch {
      toast.error(t("fieldMappings.createFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function removeMapping(mappingId: string) {
    setBusyId(mappingId);
    try {
      const res = await fetch(`/api/settings/providers/field-mappings/${mappingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(t("fieldMappings.deleted"));
      router.refresh();
    } catch {
      toast.error(t("fieldMappings.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function createTargetField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyId) return;
    const form = new FormData(event.currentTarget);
    setBusyId("new");
    try {
      const res = await fetch("/api/settings/providers/target-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.get("key"),
          label: form.get("label"),
          scope: form.get("scope"),
          target_model: form.get("target_model"),
          target_field: form.get("target_field"),
          value_type: form.get("value_type"),
          required: form.get("required") === "on",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("targetFields.created"));
      router.refresh();
    } catch {
      toast.error(t("targetFields.createFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function archiveTargetField(targetField: TargetField) {
    setBusyId(targetField.id);
    try {
      const res = await fetch(`/api/settings/providers/target-fields/${targetField.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(t("targetFields.deleted"));
      router.refresh();
    } catch {
      toast.error(t("targetFields.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const unmapped = targetFields.filter((f) => !mappingsByTarget.has(f.id)).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
      {/* Left: Source fields panel */}
      <aside className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-fg)]">
            {t("sourceFields.title")}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-fg-mute)]">
            {t("sourceFields.description")}
          </p>
          <label className="relative mt-2.5 block">
            <Search
              size={13}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--color-fg-subtle)]"
            />
            <input
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              placeholder={t("sourceFields.search")}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] pr-3 pl-8 text-sm outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-fg)]"
            />
          </label>
        </div>
        <div className="grid gap-1.5 p-3">
          {filteredSource.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-[var(--color-fg-subtle)]">
              {t("sourceFields.empty")}
            </p>
          ) : (
            filteredSource.map((f) => (
              <div
                key={f.key}
                className="rounded-[var(--radius-sm)] border border-[color:var(--color-teal)]/20 bg-[color:var(--color-teal)]/5 px-3 py-2"
              >
                <p className="text-xs font-semibold text-[var(--color-fg)]">{f.label}</p>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                  {f.key}
                </p>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Right: Target fields mapping table */}
      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-fg)]">
              {t("targetFields.title")}
            </p>
            {unmapped > 0 && (
              <p className="mt-0.5 text-xs text-[color:var(--color-rose)]">
                {t("fieldMappings.unmappedCount", { count: unmapped })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNewField((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-fg-mute)] hover:text-[var(--color-fg)] transition-colors"
          >
            {showNewField ? <X size={12} /> : <Plus size={12} />}
            {showNewField ? t("fieldMappings.cancel") : t("targetFields.add")}
          </button>
        </div>

        {/* New field form */}
        {showNewField && (
          <form
            onSubmit={createTargetField}
            className="grid gap-3 border-b border-[var(--color-border)] bg-[color:var(--color-blue)]/5 p-4"
          >
            <p className="text-xs font-semibold text-[var(--color-fg-mute)] uppercase tracking-wide">
              {t("fieldMappings.newFieldTitle")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <FieldInput name="key" label={t("targetFields.key")} required placeholder="po_number" />
              <FieldInput name="label" label={t("targetFields.label")} required placeholder="PO Number" />
              <FieldSelect name="scope" label={t("targetFields.scope")} options={["header", "line", "partner", "shipping", "billing"]} />
              <FieldInput name="target_model" label={t("targetFields.model")} required placeholder="sale.order" />
              <FieldInput name="target_field" label={t("targetFields.field")} required placeholder="client_order_ref" />
              <FieldSelect name="value_type" label={t("targetFields.type")} options={["text", "number", "date", "currency", "boolean", "json"]} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-[var(--color-fg-mute)]">
                <input type="checkbox" name="required" className="size-3.5" />
                {t("targetFields.required")}
              </label>
              <button
                type="submit"
                disabled={busyId !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busyId === "new" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {t("fieldMappings.createField")}
              </button>
            </div>
          </form>
        )}

        {/* Mapping rows grouped by scope */}
        <div className="divide-y divide-[var(--color-border)]">
          {grouped.map(([scope, fields]) => (
            <div key={scope}>
              <div className="bg-[var(--color-surface-mute)] px-4 py-1.5">
                <p className="text-[10px] font-semibold tracking-widest text-[var(--color-fg-subtle)] uppercase">
                  {scope}
                </p>
              </div>
              {fields.map((targetField) => {
                const mapping = mappingsByTarget.get(targetField.id);
                const isExpanded = expandedId === targetField.id;

                return (
                  <div key={targetField.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    {/* Row */}
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        mapping ? "hover:bg-[color:var(--color-teal)]/5" : "hover:bg-[var(--color-surface-mute)]",
                      )}
                    >
                      {/* Status dot */}
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          mapping ? "bg-[color:var(--color-teal)]" : "bg-[var(--color-border)]",
                        )}
                      />

                      {/* Target field info */}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-fg)]">
                          {targetField.label}
                          {targetField.required && (
                            <span className="text-[9px] font-bold tracking-wide text-[color:var(--color-rose)] uppercase">
                              REQ
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--color-fg-subtle)]">
                          {targetField.target_model}.{targetField.target_field}
                        </p>
                      </div>

                      {/* Arrow */}
                      <span className="shrink-0 text-[var(--color-fg-subtle)]">
                        {mapping ? (
                          <Link2 size={13} className="text-[color:var(--color-teal)]" />
                        ) : (
                          <Link2Off size={13} className="text-[var(--color-border)]" />
                        )}
                      </span>

                      {/* Source field */}
                      <div className="w-44 shrink-0">
                        {mapping ? (
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-xs font-semibold text-[color:var(--color-teal)]">
                              {mapping.source_field_label || mapping.source_field_key}
                            </p>
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => void removeMapping(mapping.id)}
                              className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[color:var(--color-rose)] disabled:opacity-40 transition-colors"
                              title={t("fieldMappings.deleteMappingTitle")}
                            >
                              {busyId === mapping.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <X size={11} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : targetField.id)}
                            className="flex w-full items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-fg-subtle)] hover:border-[var(--color-fg)] hover:text-[var(--color-fg)] transition-colors"
                          >
                            <Plus size={10} />
                            {t("fieldMappings.connect")}
                          </button>
                        )}
                      </div>

                      {/* Expand / delete */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : targetField.id)}
                          className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-mute)] hover:text-[var(--color-fg)] transition-colors"
                        >
                          <ChevronDown
                            size={13}
                            className={cn("transition-transform", isExpanded && "rotate-180")}
                          />
                        </button>
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void archiveTargetField(targetField)}
                          className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--color-fg-subtle)] hover:bg-[color:var(--color-rose)]/10 hover:text-[color:var(--color-rose)] disabled:opacity-40 transition-colors"
                        >
                          {busyId === targetField.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Trash2 size={11} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded: quick mapping form */}
                    {isExpanded && (
                      <MappingForm
                        targetField={targetField}
                        sourceFields={sourceFields}
                        busy={busyId === targetField.id}
                        onSubmit={(key, label) => void createMapping(targetField, key, label)}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MappingForm({
  targetField,
  sourceFields,
  busy,
  onSubmit,
  onClose,
}: {
  targetField: TargetField;
  sourceFields: SourceField[];
  busy: boolean;
  onSubmit: (key: string, label: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("settings.providers");
  const [tab, setTab] = useState<"existing" | "custom">(
    sourceFields.length > 0 ? "existing" : "custom",
  );
  const [selected, setSelected] = useState(sourceFields[0]?.key ?? "");
  const [customKey, setCustomKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  function submit() {
    if (tab === "existing") {
      const sf = sourceFields.find((f) => f.key === selected);
      if (!selected) return;
      onSubmit(selected, sf?.label ?? selected);
    } else {
      if (!customKey.trim()) return;
      onSubmit(customKey.trim(), customLabel.trim() || customKey.trim());
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-mute)] px-4 py-3">
      <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-[var(--color-fg-subtle)] uppercase">
        {t("fieldMappings.connectSource", { field: targetField.label })}
      </p>

      {/* Tab switcher */}
      <div className="mb-3 flex gap-1">
        {(["existing", "custom"] as const).map((tab_) => (
          <button
            key={tab_}
            type="button"
            onClick={() => setTab(tab_)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
              tab === tab_
                ? "bg-[var(--color-fg)] text-[var(--color-bg)]"
                : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
            )}
          >
            {tab_ === "existing" ? t("fieldMappings.existingField") : t("fieldMappings.customField")}
          </button>
        ))}
      </div>

      {tab === "existing" ? (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
        >
          <option value="">{t("fieldMappings.selectSource")}</option>
          {sourceFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder={t("fieldMappings.keyPlaceholder")}
            className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
          />
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder={t("fieldMappings.labelPlaceholder")}
            className="h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
          />
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-3 text-xs text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
        >
          {t("fieldMappings.cancel")}
        </button>
        <button
          type="button"
          disabled={busy || (tab === "existing" ? !selected : !customKey.trim())}
          onClick={submit}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          {t("fieldMappings.connect")}
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
      />
    </label>
  );
}

function FieldSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
        {label}
      </span>
      <select
        name={name}
        required
        defaultValue={defaultValue}
        className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm outline-none focus:border-[var(--color-fg)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
