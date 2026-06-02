import type { useTranslations } from "next-intl";
import type {
  LayoutPresetId,
  ReviewProfileLayout,
  ReviewSectionId,
  TargetField,
} from "./types";
import { SECTION_IDS } from "./types";

type Translator = ReturnType<typeof useTranslations<"templates.profileStudio">>;

export function defaultLayout(t: Translator): ReviewProfileLayout {
  return {
    default_section: "header",
    sections: [
      { id: "header", label: t("reviewSections.header"), enabled: true, order: 0 },
      { id: "shipping", label: t("reviewSections.shipping"), enabled: true, order: 1 },
      { id: "lines", label: t("reviewSections.lines"), enabled: true, order: 2 },
      { id: "notes", label: t("reviewSections.notes"), enabled: true, order: 3 },
    ],
    field_sections: {},
    field_order: {},
  };
}

export function presetLayout(preset: LayoutPresetId, t: Translator): ReviewProfileLayout {
  const base = defaultLayout(t);
  if (preset === "fast") {
    return {
      ...base,
      default_section: "header",
      sections: base.sections.map((section) => ({
        ...section,
        enabled: section.id === "header" || section.id === "lines",
      })),
    };
  }
  if (preset === "shipping_focus") {
    return {
      ...base,
      default_section: "shipping",
      sections: [
        { ...base.sections.find((s) => s.id === "shipping")!, order: 0, enabled: true },
        { ...base.sections.find((s) => s.id === "header")!, order: 1, enabled: true },
        { ...base.sections.find((s) => s.id === "lines")!, order: 2, enabled: true },
        { ...base.sections.find((s) => s.id === "notes")!, order: 3, enabled: false },
      ],
    };
  }
  return base;
}

export function normalizeLayout(
  raw: Record<string, unknown> | null | undefined,
  t: Translator,
): ReviewProfileLayout {
  const fallback = defaultLayout(t);
  if (!raw) return fallback;

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const byId = new Map<ReviewSectionId, (typeof fallback.sections)[number]>();

  for (const rawSection of rawSections) {
    if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) continue;
    const section = rawSection as Record<string, unknown>;
    const id = section.id;
    if (id !== "header" && id !== "shipping" && id !== "lines" && id !== "notes") continue;
    byId.set(id, {
      id,
      label:
        typeof section.label === "string" && section.label.trim()
          ? section.label.trim()
          : (fallback.sections.find((item) => item.id === id)?.label ?? id),
      enabled: section.enabled !== false,
      order:
        typeof section.order === "number" && Number.isFinite(section.order) ? section.order : 100,
    });
  }

  const sections = SECTION_IDS.map(
    (id, index) => byId.get(id) ?? { ...fallback.sections[index], order: index },
  ).sort((a, b) => a.order - b.order);

  const defaultSectionRaw = raw.default_section;
  const defaultSection: ReviewSectionId =
    defaultSectionRaw === "header" ||
    defaultSectionRaw === "shipping" ||
    defaultSectionRaw === "lines" ||
    defaultSectionRaw === "notes"
      ? defaultSectionRaw
      : (sections.find((s) => s.enabled)?.id ?? "header");

  return {
    default_section: defaultSection,
    sections,
    field_sections: parseFieldSections(raw.field_sections),
    field_order: parseFieldOrder(raw.field_order),
  };
}

function parseFieldSections(raw: unknown): Partial<Record<string, ReviewSectionId>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Partial<Record<string, ReviewSectionId>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (value === "header" || value === "shipping" || value === "lines" || value === "notes") {
      result[key.trim()] = value;
    }
  }
  return result;
}

function parseFieldOrder(raw: unknown): Partial<Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Partial<Record<string, number>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    result[key.trim()] = Math.max(0, Math.floor(value));
  }
  return result;
}

export function layoutPayload(layout: ReviewProfileLayout) {
  return {
    default_section: layout.default_section,
    sections: layout.sections.map((section, index) => ({
      id: section.id,
      label: section.label.trim() || section.id,
      enabled: section.enabled,
      order: index,
    })),
    field_sections: layout.field_sections,
    field_order: layout.field_order,
  };
}

export function moveSection(
  layout: ReviewProfileLayout,
  sectionId: ReviewSectionId,
  direction: -1 | 1,
): ReviewProfileLayout {
  const currentIndex = layout.sections.findIndex((s) => s.id === sectionId);
  if (currentIndex === -1) return layout;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= layout.sections.length) return layout;
  const next = [...layout.sections];
  [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
  return {
    ...layout,
    sections: next.map((s, i) => ({ ...s, order: i })),
  };
}

export function defaultSectionForField(field: TargetField): ReviewSectionId {
  if (field.scope === "line") return "lines";
  if (field.key === "note") return "notes";
  if (field.key === "shipping_address" || field.key === "billing_address") return "shipping";
  return "header";
}
