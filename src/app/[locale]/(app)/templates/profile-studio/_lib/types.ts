export type DocumentKind = "purchase_order" | "invoice" | "shipping" | "receipt" | "custom";
export type ReviewSectionId = "header" | "shipping" | "lines" | "notes";

export type ReviewLayoutSection = {
  id: ReviewSectionId;
  label: string;
  enabled: boolean;
  order: number;
};

export type ReviewProfileLayout = {
  default_section: ReviewSectionId;
  sections: ReviewLayoutSection[];
  field_sections: Partial<Record<string, ReviewSectionId>>;
  field_order: Partial<Record<string, number>>;
};

export type ReviewProfile = {
  id: string;
  name: string;
  slug: string;
  document_kind: DocumentKind;
  description: string | null;
  layout: Record<string, unknown> | null;
  active: boolean;
  system: boolean;
  sort_order: number;
  updated_at: string;
  normalize_billing_from_odoo_partner: boolean;
};

export type TargetField = {
  id: string;
  key: string;
  label: string;
  scope: "header" | "line" | "partner" | "shipping" | "billing";
  target_model: string;
  target_field: string;
  value_type: string;
  required: boolean;
  active: boolean;
  system: boolean;
  sort_order: number;
  review_profile_id: string | null;
};

export type LayoutPresetId = "default" | "fast" | "shipping_focus";

export const DOC_KIND_OPTIONS: ReadonlyArray<{
  id: DocumentKind;
  key: "purchaseOrder" | "invoice" | "shipping" | "receipt" | "custom";
}> = [
  { id: "purchase_order", key: "purchaseOrder" },
  { id: "invoice", key: "invoice" },
  { id: "shipping", key: "shipping" },
  { id: "receipt", key: "receipt" },
  { id: "custom", key: "custom" },
];

export const SECTION_IDS: ReviewSectionId[] = ["header", "shipping", "lines", "notes"];
