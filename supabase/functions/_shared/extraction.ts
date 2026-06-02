/**
 * Shared extraction types and quality evaluation.
 * Provider-agnostic — Anthropic is the only AI provider in use.
 */

export interface NormalizedLineItem {
  position: number;
  sku: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  tax_rate: number | null;
  /** Alternate product codes seen on the same line (UPC, manufacturer part no, model number, etc) */
  alt_codes?: string[];
  /**
   * Partner/customer-recognized product code as it appeared on the source PO.
   * Distinct from `sku` (which holds OUR internal default_code after swap).
   * Populated by ai-process when a swap occurs OR by extracting a non-catalog
   * alt_code. Used by odoo-sync to fill sale.order.line.x_customer_sku.
   */
  customer_sku?: string | null;
  /**
   * Tipo de línea según el extractor IA (prompt v6+). El backend usa esto para
   * tratarlas distinto en odoo-sync (descuento como price_unit negativo,
   * freight como cargo, etc.). Default "item" cuando el modelo no lo emite.
   */
  kind?: "item" | "discount" | "freight" | "surcharge" | "adjustment";
}

export const LINE_KINDS = ["item", "discount", "freight", "surcharge", "adjustment"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export function normalizeLineKind(raw: unknown): LineKind {
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if ((LINE_KINDS as readonly string[]).includes(v)) return v as LineKind;
  }
  return "item";
}

export type DetectedFieldProvenance = "pdf_text" | "anchor" | "manual" | "anthropic";

export interface DetectedField {
  rects?: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence?: number | null;
    provenance: DetectedFieldProvenance;
  }>;
  provenance?: DetectedFieldProvenance;
  key: string;
  label: string;
  value: string;
  page: number | null;
  confidence: number | null;
  category: "header" | "line_item" | "address" | "terms" | "totals" | "other";
  source: "anthropic" | "anchor" | "manual" | "pdf_text";
  path?: string;
  evidence?: {
    source_text: string | null;
    inferred: boolean;
    rule: string | null;
  };
}

export interface NormalizedOrder {
  po_number: string | null;
  po_date: string | null;
  delivery_date: string | null; // estimated delivery / do-not-deliver-after (ISO YYYY-MM-DD)
  currency: string | null;
  payment_terms: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_contact_person: string | null;
  delivery_address: string | null;
  delivery_name: string | null;
  delivery_contact_person: string | null;
  delivery_phone: string | null;
  delivery_email: string | null;
  delivery_street: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  delivery_country: string | null;
  billing_address: string | null;
  billing_name: string | null;
  billing_contact_person: string | null;
  billing_phone: string | null;
  billing_email: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  notes: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  line_items: NormalizedLineItem[];
  detected_fields: DetectedField[];
  confidence: number;
}

export interface NormalizedOrderEvaluation {
  issues: string[];
  criticalMissing: number;
  score: number;
}

function roundMoney(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function validateNormalizedOrder(order: NormalizedOrder): string[] {
  const issues: string[] = [];

  if (order.po_date && !/^\d{4}-\d{2}-\d{2}$/.test(order.po_date)) {
    issues.push("po_date must be ISO YYYY-MM-DD or null");
  }
  if (order.currency && !/^[A-Z]{3}$/.test(order.currency)) {
    issues.push("currency must be a 3-letter ISO code or null");
  }
  if (!Array.isArray(order.line_items)) {
    issues.push("line_items must be an array");
  }
  for (const [index, line] of order.line_items.entries()) {
    if (!line.description.trim()) issues.push(`line_items[${index}].description is required`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      issues.push(`line_items[${index}].quantity must be positive`);
    }
    if (line.line_total !== null && line.unit_price !== null) {
      const expected = roundMoney(line.quantity * line.unit_price);
      if (expected !== null && Math.abs(line.line_total - expected) > 0.05) {
        issues.push(`line_items[${index}] total does not match quantity * unit_price`);
      }
    }
  }
  if (order.subtotal !== null && order.line_items.some((line) => line.line_total !== null)) {
    const lineSum = roundMoney(
      order.line_items.reduce((sum, line) => sum + (line.line_total ?? 0), 0),
    );
    if (
      lineSum !== null &&
      Math.abs(order.subtotal - lineSum) > Math.max(0.05, Math.abs(order.subtotal) * 0.02)
    ) {
      issues.push("subtotal differs from line totals by more than 2%");
    }
  }
  if (order.total !== null && order.subtotal !== null && order.tax_total !== null) {
    const expected = roundMoney(order.subtotal + order.tax_total);
    if (
      expected !== null &&
      Math.abs(order.total - expected) > Math.max(0.05, Math.abs(order.total) * 0.02)
    ) {
      issues.push("total differs from subtotal + tax_total by more than 2%");
    }
  }
  if (order.confidence < 0 || order.confidence > 1) {
    issues.push("confidence must be between 0 and 1");
  }

  return issues;
}

function criticalMissingCount(order: NormalizedOrder): number {
  let missing = 0;
  if (!order.po_number) missing += 1;
  if (!order.customer_name) missing += 1;
  if (!order.currency) missing += 1;
  if (!order.line_items.length) missing += 3;
  if (order.subtotal === null && order.total === null) missing += 2;
  return missing;
}

export function evaluateNormalizedOrder(order: NormalizedOrder): NormalizedOrderEvaluation {
  const issues = validateNormalizedOrder(order);
  const criticalMissing = criticalMissingCount(order);
  const score = order.confidence - issues.length * 0.12 - criticalMissing * 0.18;
  return { issues, criticalMissing, score };
}
