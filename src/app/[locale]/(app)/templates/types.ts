export type Provider = {
  id: string;
  name: string;
  code: string;
  status: string;
  default_currency: string | null;
  email_domains: string[];
  settings?: Record<string, unknown> | null;
  created_at: string;
};

export type ProviderStats = {
  fieldMappingCount: number;
  skuMappingCount: number;
  documentsTotal: number;
  documentsReviewed: number;
  documentsNeedsReview: number;
  documentsFailed: number;
  lastDocumentAt: string | null;
};

export type TargetField = {
  id: string;
  key: string;
  label: string;
  scope: string;
  target_model: string;
  target_field: string;
  value_type: string;
  required: boolean;
  active: boolean;
  system: boolean;
  sort_order: number;
};

export type FieldMapping = {
  id: string;
  provider_id: string;
  target_field_id: string;
  source_field_key: string;
  source_field_label: string | null;
  active: boolean;
};

export type OdooProduct = {
  odoo_product_id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  uom_name: string | null;
};

export type ProductMapping = {
  id: string;
  provider_id: string;
  source_sku: string | null;
  source_company_sku: string | null;
  source_description: string | null;
  odoo_product_id: number;
  odoo_product_name: string;
  odoo_default_code: string | null;
  source: "manual" | "auto" | "imported" | "odoo_catalog";
  confidence: number;
};
