"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  LayoutList,
  Loader2,
  NotebookText,
  ReceiptText,
  Save,
  Search,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  defaultSectionForField,
  layoutPayload,
  moveSection,
  normalizeLayout,
} from "../../_lib/layout";
import type {
  ReviewLayoutSection,
  ReviewProfile,
  ReviewProfileLayout,
  ReviewSectionId,
  TargetField,
} from "../../_lib/types";
import { SECTION_IDS } from "../../_lib/types";

type Props = {
  profile: ReviewProfile;
  initialTargetFields: TargetField[];
};

const SECTION_ICONS: Record<ReviewSectionId, React.ElementType> = {
  header: ReceiptText,
  shipping: Truck,
  lines: LayoutList,
  notes: NotebookText,
};

const DUMMY_VALUES: Record<string, string> = {
  client_order_ref: "PO-2026-0042",
  date_order: "May 5, 2026",
  currency_id: "USD",
  partner_id: "ACME Corp.",
  partner_invoice_id: "123 Main St",
  partner_shipping_id: "456 Warehouse Rd",
  validity_date: "May 31, 2026",
  payment_term_id: "Net 30",
  pricelist_id: "Sales Price",
  warehouse_id: "Main",
  incoterm: "EXW",
  note: "Please deliver to dock B.",
  product_id: "SKU-001 Widget Pro",
  product_uom_qty: "10",
  price_unit: "$24.99",
  tax_id: "15%",
  product_uom: "Unit",
};

function getDummyValue(field: TargetField): string {
  return DUMMY_VALUES[field.target_field] ?? "—";
}

export function ProfileLayoutClient({ profile, initialTargetFields }: Props) {
  const t = useTranslations("templates.profileStudio");
  const [targetFields, setTargetFields] = useState(initialTargetFields);
  const [editLayout, setEditLayout] = useState<ReviewProfileLayout>(() =>
    normalizeLayout(profile.layout, t),
  );
  const [activePreviewTab, setActivePreviewTab] = useState<ReviewSectionId>(
    editLayout.default_section,
  );
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);
  const [busyLayout, setBusyLayout] = useState(false);
  const [query, setQuery] = useState("");

  const assignedToProfile = useMemo(
    () => targetFields.filter((f) => f.review_profile_id === profile.id),
    [targetFields, profile.id],
  );

  const unassigned = useMemo(
    () => targetFields.filter((f) => !f.review_profile_id),
    [targetFields],
  );

  const previewGroups = useMemo(() => {
    const groups: Record<ReviewSectionId, TargetField[]> = {
      header: [], shipping: [], lines: [], notes: [],
    };
    for (const f of assignedToProfile) {
      const section = editLayout.field_sections[f.key] ?? defaultSectionForField(f);
      groups[section].push(f);
    }
    return groups;
  }, [assignedToProfile, editLayout.field_sections]);

  const enabledSections = useMemo(
    () => editLayout.sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order),
    [editLayout.sections],
  );

  const filteredUnassigned = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return unassigned;
    return unassigned.filter((f) =>
      [f.label, f.key, f.target_field].join(" ").toLowerCase().includes(q),
    );
  }, [unassigned, query]);

  async function assignField(fieldId: string, profileId: string | null) {
    if (busyFieldId) return;
    setBusyFieldId(fieldId);
    try {
      const res = await fetch(`/api/settings/providers/target-fields/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_profile_id: profileId }),
      });
      const body = (await res.json().catch(() => ({}))) as { item?: TargetField };
      if (!res.ok || !body.item) throw new Error();
      setTargetFields((cur) => cur.map((f) => (f.id === body.item?.id ? body.item : f)));
    } catch {
      toast.error(t("errors.fieldAssignFailed"));
    } finally {
      setBusyFieldId(null);
    }
  }

  function moveFieldSection(fieldKey: string, sectionId: ReviewSectionId) {
    setEditLayout((cur) => ({
      ...cur,
      field_sections: { ...cur.field_sections, [fieldKey]: sectionId },
    }));
  }

  async function saveLayout() {
    if (busyLayout) return;
    if (!editLayout.sections.some((s) => s.enabled)) {
      toast.error(t("errors.layoutNeedsSection"));
      return;
    }
    setBusyLayout(true);
    try {
      const res = await fetch(`/api/integrations/review-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: layoutPayload(editLayout) }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("toasts.profileUpdated"));
    } catch {
      toast.error(t("errors.profileUpdateFailed"));
    } finally {
      setBusyLayout(false);
    }
  }

  function toggleSection(sectionId: ReviewSectionId) {
    setEditLayout((cur) => {
      const enabling = !cur.sections.find((s) => s.id === sectionId)?.enabled;
      const otherEnabled = cur.sections.filter((s) => s.enabled && s.id !== sectionId);
      if (!enabling && otherEnabled.length === 0) return cur;
      return {
        ...cur,
        sections: cur.sections.map((s) =>
          s.id === sectionId ? { ...s, enabled: enabling } : s,
        ),
        default_section:
          cur.default_section === sectionId && !enabling
            ? (cur.sections.find((s) => s.id !== sectionId && s.enabled)?.id ?? "header")
            : cur.default_section,
      };
    });
  }

  function setDefault(sectionId: ReviewSectionId) {
    setEditLayout((cur) => ({ ...cur, default_section: sectionId }));
  }

  function moveSectionOrder(sectionId: ReviewSectionId, direction: -1 | 1) {
    setEditLayout((cur) => moveSection(cur, sectionId, direction));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      {/* ── Editor ── */}
      <div className="grid gap-4">

        {/* Sections */}
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
            Sections
          </p>
          <div className="grid gap-2">
            {editLayout.sections.map((section, idx) => {
              const Icon = SECTION_ICONS[section.id];
              const isDefault = editLayout.default_section === section.id;
              return (
                <div
                  key={section.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2 transition-colors",
                    section.enabled
                      ? "border-[var(--color-border)] bg-[var(--color-bg)]"
                      : "border-dashed border-[var(--color-border)] bg-[var(--color-surface-mute)] opacity-50",
                  )}
                >
                  <Icon size={14} className="shrink-0 text-[var(--color-fg-mute)]" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-fg)]">
                    {section.label}
                  </span>
                  {section.enabled && (
                    <button
                      type="button"
                      onClick={() => setDefault(section.id)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                        isDefault
                          ? "bg-[color:var(--color-blue)]/10 text-[color:var(--color-blue)]"
                          : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
                      )}
                    >
                      {isDefault ? "Default" : "Set default"}
                    </button>
                  )}
                  <div className="flex gap-0.5">
                    <button type="button" disabled={idx === 0} onClick={() => moveSectionOrder(section.id, -1)} className="grid size-6 place-items-center rounded text-[10px] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-mute)] disabled:opacity-30">↑</button>
                    <button type="button" disabled={idx === editLayout.sections.length - 1} onClick={() => moveSectionOrder(section.id, 1)} className="grid size-6 place-items-center rounded text-[10px] text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-mute)] disabled:opacity-30">↓</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className={cn(
                      "h-5 min-w-8 rounded-full px-2 text-[10px] font-semibold tracking-wide transition-colors uppercase",
                      section.enabled
                        ? "bg-[color:var(--color-teal)]/10 text-[color:var(--color-teal)]"
                        : "bg-[var(--color-surface-mute)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    {section.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Assigned fields table */}
        {assignedToProfile.length > 0 && (
          <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
              Assigned fields ({assignedToProfile.length})
            </p>
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-mute)]">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">Field</th>
                    <th className="w-36 px-3 py-2 text-left text-[10px] font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">Section</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {assignedToProfile.map((f) => {
                    const currentSection = (editLayout.field_sections[f.key] ?? defaultSectionForField(f)) as ReviewSectionId;
                    return (
                      <tr key={f.id} className="hover:bg-[var(--color-surface-mute)]">
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium text-[var(--color-fg)]">{f.label}</p>
                          <p className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{f.target_field}</p>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={currentSection}
                            onChange={(e) => moveFieldSection(f.key, e.target.value as ReviewSectionId)}
                            className="h-7 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs outline-none focus:border-[var(--color-fg)]"
                          >
                            {SECTION_IDS.filter((sid) =>
                              editLayout.sections.find((s) => s.id === sid)?.enabled,
                            ).map((sid) => (
                              <option key={sid} value={sid}>{sid}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={busyFieldId !== null}
                            onClick={() => void assignField(f.id, null)}
                            className="text-[11px] text-[var(--color-fg-subtle)] hover:text-[color:var(--color-rose)] disabled:opacity-40"
                          >
                            {busyFieldId === f.id ? <Loader2 size={10} className="animate-spin" /> : "✕"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Available fields */}
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-wide text-[var(--color-fg-mute)] uppercase">
              Available ({unassigned.length})
            </p>
            <label className="relative">
              <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-7 w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] pr-2 pl-6 text-xs outline-none focus:border-[var(--color-fg)]" />
            </label>
          </div>
          {filteredUnassigned.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--color-fg-subtle)]">
              {unassigned.length === 0 ? "All fields assigned." : "No match."}
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredUnassigned.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busyFieldId !== null}
                  onClick={() => void assignField(f.id, profile.id)}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-2 text-left transition-colors hover:border-[color:var(--color-teal)] hover:bg-[color:var(--color-teal)]/5 disabled:opacity-40"
                >
                  {busyFieldId === f.id ? (
                    <Loader2 size={11} className="shrink-0 animate-spin text-[var(--color-fg-subtle)]" />
                  ) : (
                    <span className="text-[10px] text-[var(--color-fg-subtle)]">+</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--color-fg)]">{f.label}</p>
                    <p className="truncate font-mono text-[9px] text-[var(--color-fg-subtle)]">{f.target_field}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void saveLayout()}
            disabled={busyLayout}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-5 text-sm font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busyLayout ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save layout
          </button>
        </div>
      </div>

      {/* ── Review Sidebar Preview ── */}
      <ReviewSidebarPreview
        sections={enabledSections}
        activeTab={activePreviewTab}
        onTabChange={setActivePreviewTab}
        fieldGroups={previewGroups}
      />
    </div>
  );
}

function ReviewSidebarPreview({
  sections,
  activeTab,
  onTabChange,
  fieldGroups,
}: {
  sections: ReviewLayoutSection[];
  activeTab: ReviewSectionId;
  onTabChange: (s: ReviewSectionId) => void;
  fieldGroups: Record<ReviewSectionId, TargetField[]>;
}) {
  const safeTab = sections.some((s) => s.id === activeTab) ? activeTab : (sections[0]?.id ?? "header");
  const fields = fieldGroups[safeTab] ?? [];

  return (
    <aside className="sticky top-5 flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]" style={{ maxHeight: "calc(100vh - 120px)" }}>
      {/* Banner */}
      <div className="shrink-0 border-b border-[color:var(--color-amber)]/25 bg-[color:var(--color-amber)]/8 px-3 py-1.5 text-[11px] text-[color:var(--color-amber)]">
        Vista previa — valores de ejemplo, no datos reales.
      </div>

      {/* Mock order header */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
        <p className="text-[10px] font-semibold tracking-widest text-[var(--color-fg-subtle)] uppercase">Sales Order</p>
        <p className="mt-0.5 text-base font-bold text-[var(--color-fg)]">PO-2026-0042</p>
        <div className="mt-2 flex gap-1.5">
          <span className="inline-flex items-center rounded-full bg-[color:var(--color-teal)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--color-teal)]">Ready</span>
          <span className="inline-flex items-center rounded-full bg-[var(--color-surface-mute)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-fg-mute)]">Not synced</span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
        <div
          className="grid h-10 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]"
          style={{ gridTemplateColumns: `repeat(${Math.max(sections.length, 1)}, minmax(0, 1fr))` }}
        >
          {sections.map((section) => {
            const Icon = SECTION_ICONS[section.id];
            const isActive = safeTab === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onTabChange(section.id)}
                className={cn(
                  "flex items-center justify-center gap-1 border-r border-[var(--color-border)] text-[11px] font-medium last:border-r-0 transition-colors",
                  isActive
                    ? "bg-[var(--color-surface)] text-[var(--color-fg)]"
                    : "text-[var(--color-fg-mute)] hover:bg-[var(--color-surface-mute)]",
                )}
              >
                <Icon size={11} aria-hidden="true" />
                <span className="truncate">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fields */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {fields.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--color-fg-subtle)]">
            No fields assigned to this section yet.
          </div>
        ) : (
          <div className="grid gap-2.5">
            {fields.slice(0, 12).map((f) => (
              <ReviewFieldMock key={f.id} field={f} />
            ))}
            {fields.length > 12 && (
              <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">+{fields.length - 12} more fields…</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function ReviewFieldMock({ field }: { field: TargetField }) {
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-fg-mute)]">
        {field.label}
        {field.required && (
          <span className="text-[9px] font-bold tracking-wide text-[color:var(--color-rose)] uppercase">req</span>
        )}
      </label>
      <div className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm italic text-[var(--color-fg-mute)]">
        {getDummyValue(field)}
      </div>
    </div>
  );
}
