import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { emitWorkflowEvent } from "../_shared/events.ts";
import { secrets } from "../_shared/secrets.ts";
import { awaitedInvoke } from "../_shared/triggerFunction.ts";
import { detectDocumentBoundaries } from "../_shared/boundary-detection.ts";
import { excelToText, isExcelMimeOrName } from "../_shared/excel.ts";
import { extractPageRange, getPdfPageCount, mergePagesTall } from "../_shared/pdf-split.ts";
import {
  ANTHROPIC_PROMPT_VERSION,
  consumeAnthropicUsageSummary,
  normalizePdfWithAnthropic,
  normalizeTextWithAnthropic,
} from "../_shared/anthropic.ts";
import {
  type DetectedField,
  evaluateNormalizedOrder,
  type NormalizedOrder,
} from "../_shared/extraction.ts";

interface AiProcessPayload {
  document_id?: string;
  tenant_id?: string;
  run_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function money(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10_000) / 10_000;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function htmlToText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function mergeDetectedFields(...groups: Array<DetectedField[] | undefined>): DetectedField[] {
  const seen = new Set<string>();
  const fields = groups.flatMap((group) => group ?? []);

  return fields.filter((field) => {
    const signature = `${field.key}|${field.page ?? ""}|${field.value}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

type ExtractionCandidate = {
  method: "email_body_anthropic" | "anthropic_multimodal";
  normalized: NormalizedOrder;
  issues: string[];
  score: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number | null;
  };
};

type ExtractionMethodBenchmark = {
  method: ExtractionCandidate["method"];
  confidence: number;
  score: number;
  issues_count: number;
  critical_missing_count: number;
  line_items_count: number;
  estimated_cost_index: number;
  estimated_cost_usd: number;
};

type AiRuntimeConfig = {
  provider: "anthropic";
  primaryModel: string;
  fallbackModel: string | null;
  apiKey: string;
  promptVersion: string;
};

function estimateAnthropicCostUsd(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const model = params.model.toLowerCase();
  const pricing = model.includes("opus-4-6")
    ? { inputPerM: 5, outputPerM: 25 }
    : model.includes("opus")
      ? { inputPerM: 5, outputPerM: 25 }
      : { inputPerM: 3, outputPerM: 15 };

  const inputCost = (params.inputTokens / 1_000_000) * pricing.inputPerM;
  const outputCost = (params.outputTokens / 1_000_000) * pricing.outputPerM;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

async function loadAiRuntimeConfig(params: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
}): Promise<AiRuntimeConfig> {
  const defaultAnthropic: AiRuntimeConfig = {
    provider: "anthropic",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: null,
    apiKey: secrets.anthropicApiKey ?? "",
    promptVersion: ANTHROPIC_PROMPT_VERSION,
  };

  const { data: row } = await params.supabase
    .from("ai_connections")
    .select("provider, primary_model, api_key_enc, status")
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (!row || row.status !== "active") {
    if (!defaultAnthropic.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    return defaultAnthropic;
  }

  const provider = "anthropic" as const;
  const promptVersion = ANTHROPIC_PROMPT_VERSION;
  void row; // ai_connections row is no longer used; kept for the active-status check above

  try {
    const apiKey = await decrypt(String(row.api_key_enc ?? ""), secrets.intakeSecretsKey);
    if (!apiKey.trim()) {
      if (secrets.anthropicApiKey) {
        return {
          provider,
          primaryModel: "claude-sonnet-4-6",
          fallbackModel: null,
          apiKey: secrets.anthropicApiKey,
          promptVersion,
        };
      }
      throw new Error("Anthropic API key is required");
    }

    return {
      provider,
      primaryModel: "claude-sonnet-4-6",
      fallbackModel: null,
      apiKey,
      promptVersion,
    };
  } catch {
    if (secrets.anthropicApiKey) {
      return {
        provider,
        primaryModel: "claude-sonnet-4-6",
        fallbackModel: null,
        apiKey: secrets.anthropicApiKey,
        promptVersion,
      };
    }
    throw new Error("Anthropic API key is required");
  }
}

function pickBestCandidate(candidates: ExtractionCandidate[]): ExtractionCandidate {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.normalized.confidence !== a.normalized.confidence) {
      return b.normalized.confidence - a.normalized.confidence;
    }
    return b.normalized.line_items.length - a.normalized.line_items.length;
  })[0];
}

function estimateMethodBenchmark(params: {
  candidate: ExtractionCandidate;
  pageCount: number;
}): ExtractionMethodBenchmark {
  const { candidate, pageCount } = params;
  const normalized = candidate.normalized;
  const lineItems = normalized.line_items.length;
  const criticalMissing =
    (normalized.po_number ? 0 : 1) +
    (normalized.customer_name ? 0 : 1) +
    (normalized.currency ? 0 : 1) +
    (lineItems > 0 ? 0 : 1);

  const estimatedCostIndex =
    Math.round((1 + pageCount * 0.55 + Math.min(3, lineItems * 0.015)) * 1000) / 1000;
  const estimatedUsd =
    Math.round((0.004 + pageCount * 0.0015 + Math.min(0.01, lineItems * 0.00004)) * 100000) / 100000;

  return {
    method: candidate.method,
    confidence: candidate.normalized.confidence,
    score: candidate.score,
    issues_count: candidate.issues.length,
    critical_missing_count: criticalMissing,
    line_items_count: lineItems,
    estimated_cost_index: estimatedCostIndex,
    estimated_cost_usd: estimatedUsd,
  };
}

type ProviderRow = {
  id: string;
  name: string;
  code: string;
  default_currency: string | null;
  email_domains: string[] | null;
};

type DocumentKind = "purchase_order" | "invoice" | "shipping" | "receipt" | "custom";

type TargetFieldRow = {
  id: string;
  key: string;
  label: string;
  target_field: string;
  active: boolean;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function safeFieldKey(value: string) {
  return value
    .trim()
    .replace(/\//g, ".")
    .replace(/[^a-zA-Z0-9.]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function uniqueLines(value: string) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

function normalizeBlock(value: string | null | undefined) {
  if (!value) return null;
  const lines = uniqueLines(value);
  if (!lines.length) return null;
  return lines.join("\n");
}

function looksLikeUsefulAddress(value: string | null | undefined) {
  if (!value) return false;
  const text = value.trim();
  if (text.length < 10) return false;
  if (/\d/.test(text) && /[A-Za-z]/.test(text)) return true;
  if (text.includes(",") && /[A-Za-z]/.test(text)) return true;
  return text.split(/\s+/).length >= 4;
}

function parseDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const yearRaw = Number(slash[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    let month = first;
    let day = second;
    if (first > 12 && second <= 12) {
      month = second;
      day = first;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const nameMatch = text
    .toLowerCase()
    .match(
      /\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b|\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/,
    );
  if (nameMatch) {
    const monthName = (nameMatch[1] ?? nameMatch[5] ?? "").slice(0, 3).toLowerCase();
    const month = monthNames.indexOf(monthName) + 1;
    const day = Number(nameMatch[2] ?? nameMatch[4] ?? "0");
    const year = Number(nameMatch[3] ?? nameMatch[6] ?? "0");
    if (month > 0 && day >= 1 && day <= 31 && year >= 2000) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function findFieldValue(
  fields: DetectedField[],
  hints: string[],
  minLength = 1,
  options?: { rejectHints?: string[] },
): string | null {
  const normalizedHints = hints.map((hint) => hint.toLowerCase());
  const rejectHints = (options?.rejectHints ?? []).map((hint) => hint.toLowerCase());
  const candidates = fields
    .filter((field) => {
      const signature = `${field.key} ${field.label}`.toLowerCase();
      if (!normalizedHints.some((hint) => signature.includes(hint))) return false;
      if (rejectHints.some((hint) => signature.includes(hint))) return false;
      return true;
    })
    .map((field) => ({
      value: field.value.trim(),
      confidence: field.confidence ?? 0,
    }))
    .filter((entry) => entry.value.length >= minLength);

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.value.length - a.value.length;
  });
  return candidates[0]?.value ?? null;
}

function extractBlockFromRawText(
  rawText: string | null | undefined,
  startPatterns: RegExp[],
  stopPatterns: RegExp[],
  maxLines = 8,
): string | null {
  if (!rawText) return null;
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (startPatterns.some((pattern) => pattern.test(lines[i].toLowerCase()))) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const block: string[] = [];
  for (let i = start + 1; i < lines.length && block.length < maxLines; i += 1) {
    const line = lines[i];
    const low = line.toLowerCase();
    if (stopPatterns.some((pattern) => pattern.test(low))) break;
    block.push(line);
  }

  const normalized = normalizeBlock(block.join("\n"));
  return normalized && looksLikeUsefulAddress(normalized) ? normalized : null;
}

function inferCurrency(
  normalized: NormalizedOrder,
  fields: DetectedField[],
  rawText: string | null | undefined,
): string | null {
  if (hasText(normalized.currency)) return normalized.currency?.trim().toUpperCase() ?? null;

  const allText = [
    normalized.notes ?? "",
    rawText ?? "",
    ...fields.map((field) => field.value),
  ].join(" ");
  const codeMatch = allText.match(/\b(USD|EUR|GBP|CAD|MXN|JPY|AUD|CHF|CNY)\b/i);
  if (codeMatch) return codeMatch[1].toUpperCase();

  if (/\$/.test(allText)) return "USD";
  if (/\b(usa|united states)\b/i.test(allText)) return "USD";
  return "USD";
}

function upsertInferredField(
  fields: DetectedField[],
  field: Omit<DetectedField, "source" | "confidence" | "page" | "category"> & {
    category: DetectedField["category"];
  },
) {
  const exists = fields.some(
    (item) => item.key === field.key && item.value.trim() === field.value.trim(),
  );
  if (exists) return;
  fields.push({
    key: field.key,
    label: field.label,
    value: field.value,
    path: field.path,
    source: "anthropic",
    confidence: 0.8,
    page: 1,
    category: field.category,
    provenance: "anchor",
  });
}

function enrichNormalizedOrder(params: {
  normalized: NormalizedOrder;
  detectedFields: DetectedField[];
}) {
  const { detectedFields } = params;
  const normalized = { ...params.normalized };
  const rawText: string | null = null;

  const dateCandidate =
    parseDateToIso(normalized.po_date) ??
    parseDateToIso(
      findFieldValue(detectedFields, [
        "po_date",
        "order_date",
        "date_order",
        "purchase_order_date",
        "invoice_date",
      ]),
    ) ??
    parseDateToIso(rawText?.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0] ?? null);
  normalized.po_date = dateCandidate;

  normalized.currency = inferCurrency(normalized, detectedFields, rawText);

  const deliveryFromFields = normalizeBlock(
    findFieldValue(detectedFields, ["delivery_address", "shipping_address", "ship_to.address"], 8, {
      rejectHints: ["name", "phone", "contact"],
    }),
  );
  const billingFromFields = normalizeBlock(
    findFieldValue(
      detectedFields,
      ["billing_address", "bill_to.address", "invoice_to.address", "receiver_address"],
      8,
      { rejectHints: ["name", "phone", "contact"] },
    ),
  );

  const deliveryFromText = extractBlockFromRawText(
    rawText,
    [/^ship\s*to\b/, /^deliver\s*to\b/, /^shipping\b/, /^delivery\s*address\b/],
    [
      /^bill\s*to\b/,
      /^invoice\s*to\b/,
      /^supplier\b/,
      /^product\b/,
      /^description\b/,
      /^total\b/,
      /^additional\s*notes?\b/,
    ],
  );
  const billingFromText = extractBlockFromRawText(
    rawText,
    [/^bill\s*to\b/, /^invoice\s*to\b/, /^billing\s*address\b/],
    [
      /^ship\s*to\b/,
      /^supplier\b/,
      /^product\b/,
      /^description\b/,
      /^total\b/,
      /^additional\s*notes?\b/,
    ],
  );

  const nextDelivery =
    deliveryFromFields ?? deliveryFromText ?? normalizeBlock(normalized.delivery_address);
  const nextBilling =
    billingFromFields ?? billingFromText ?? normalizeBlock(normalized.billing_address);

  if (looksLikeUsefulAddress(nextDelivery)) normalized.delivery_address = nextDelivery;
  if (looksLikeUsefulAddress(nextBilling)) normalized.billing_address = nextBilling;

  if (!looksLikeUsefulAddress(normalized.customer_address)) {
    normalized.customer_address =
      nextBilling ?? nextDelivery ?? normalizeBlock(normalized.customer_address);
  }

  if (!hasText(normalized.payment_terms)) {
    const ptCandidate =
      findFieldValue(
        detectedFields,
        ["payment_terms", "terms.payment", "terms_of_sale", "terms_of_payment", "sale_terms"],
        4,
      ) ??
      extractBlockFromRawText(
        rawText,
        [/^payment\s*terms?\b/, /^terms\s+of\s+(sale|payment)\b/, /^sale\s+terms?\b/],
        [/^ship\s*to\b/, /^bill\s*to\b/, /^product\b/, /^description\b/, /^total\b/],
        4,
      );
    normalized.payment_terms = normalizeBlock(ptCandidate) ?? null;
  }

  if (!hasText(normalized.notes)) {
    const noteCandidate =
      findFieldValue(detectedFields, ["additional_notes", "notes"], 4) ??
      extractBlockFromRawText(
        rawText,
        [/^additional\s*notes?\b/, /^notes?\b/],
        [/^this\s+purchase\s+order\b/, /^terms\b/, /^ship\s*to\b/, /^bill\s*to\b/],
        12,
      );
    normalized.notes = normalizeBlock(noteCandidate) ?? null;
  }

  const normalizedLines = normalized.line_items.map((line, index) => {
    const quantity = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1;
    const unitPrice =
      line.unit_price ??
      (line.line_total !== null ? Math.round((line.line_total / quantity) * 10000) / 10000 : null);
    const lineTotal =
      line.line_total ??
      (unitPrice !== null ? Math.round(quantity * unitPrice * 10000) / 10000 : null);
    return {
      ...line,
      position: line.position || index + 1,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      tax_rate: line.tax_rate ?? 0,
    };
  });
  normalized.line_items = normalizedLines;

  const subtotal =
    normalized.subtotal ?? normalizedLines.reduce((sum, line) => sum + (line.line_total ?? 0), 0);
  const taxTotal = normalized.tax_total ?? 0;
  normalized.subtotal = money(subtotal);
  normalized.tax_total = money(taxTotal);
  normalized.total = money(normalized.total ?? subtotal + taxTotal);

  if (normalized.po_date) {
    upsertInferredField(detectedFields, {
      key: "po_date",
      label: "PO Date",
      value: normalized.po_date,
      path: "inferred.po_date",
      category: "header",
    });
  }
  if (normalized.currency) {
    upsertInferredField(detectedFields, {
      key: "currency",
      label: "Currency",
      value: normalized.currency,
      path: "inferred.currency",
      category: "totals",
    });
  }
  if (normalized.delivery_address) {
    upsertInferredField(detectedFields, {
      key: "delivery_address",
      label: "Delivery Address",
      value: normalized.delivery_address,
      path: "inferred.delivery_address",
      category: "address",
    });
  }
  if (normalized.billing_address) {
    upsertInferredField(detectedFields, {
      key: "billing_address",
      label: "Billing Address",
      value: normalized.billing_address,
      path: "inferred.billing_address",
      category: "address",
    });
  }
  if (normalized.notes) {
    upsertInferredField(detectedFields, {
      key: "notes",
      label: "Notes",
      value: normalized.notes,
      path: "inferred.notes",
      category: "terms",
    });
  }

  return { normalized, detectedFields };
}

function readAddressLine(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const line1 = typeof row.line1 === "string" ? row.line1 : null;
  const line2 = typeof row.line2 === "string" ? row.line2 : null;
  return normalizeBlock([line1 ?? "", line2 ?? ""].filter(Boolean).join("\n"));
}

function mostFrequent(values: string[]) {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Catalog-aware SKU detection.
// Scans every line's detected fields against the customer's full SKU catalog.
// When a match is found in a column that's NOT the one the AI extracted into
// `line.sku`, the value is swapped — and (if a provider is set) an annotation
// is saved so future documents skip detection and apply the rule directly.
async function applyCatalogSkuDetection(params: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
  providerId: string | null;
  normalized: NormalizedOrder;
  detectedFields: DetectedField[];
}) {
  const { supabase, tenantId, providerId } = params;
  const normalized = { ...params.normalized };
  const detectedFields = params.detectedFields;

  if (normalized.line_items.length === 0) return { normalized, detectedFields };

  // Load all active SKUs/barcodes/names from catalog
  const { data: products, error: productsErr } = await supabase
    .from("integration_catalog_products")
    .select("code, barcode, name")
    .eq("tenant_id", tenantId)
    .eq("provider", "odoo")
    .eq("active", true);

  if (productsErr) {
    console.error("[ai-process] catalog load failed:", productsErr.message);
    return { normalized, detectedFields };
  }
  if (!products || products.length === 0) return { normalized, detectedFields };

  const normSku = (s: string | null | undefined) =>
    (s ?? "").toUpperCase().trim().replace(/[\s\-_/\\.]+/g, "");

  // Load provider-specific SKU mappings (e.g. Zoro G306171142 → our GW904XL).
  // Genérico: aplica a cualquier provider con mappings registrados.
  const providerMappings = new Map<
    string,
    { companySku: string | null; defaultCode: string | null; odooProductId: number }
  >();
  if (providerId) {
    const { data: mappings, error: mappingsErr } = await supabase
      .from("provider_product_mappings")
      .select("source_sku, source_company_sku, odoo_default_code, odoo_product_id")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .not("source_sku", "is", null);
    if (mappingsErr) {
      console.error("[ai-process] provider mappings load failed:", mappingsErr.message);
    } else if (mappings) {
      for (const m of mappings as Array<{
        source_sku: string | null;
        source_company_sku: string | null;
        odoo_default_code: string | null;
        odoo_product_id: number;
      }>) {
        const key = normSku(m.source_sku);
        if (!key) continue;
        providerMappings.set(key, {
          companySku: m.source_company_sku,
          defaultCode: m.odoo_default_code,
          odooProductId: m.odoo_product_id,
        });
      }
    }
  }

  // Levenshtein distance for fuzzy code matching (typos, off-by-one digits)
  function editDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return Infinity;
    const dp: number[] = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) dp[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let prev = i - 1;
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = dp[j];
        dp[j] = a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j - 1], dp[j]);
        prev = old;
      }
    }
    return dp[b.length];
  }

  // Tokenize a string into significant words for name matching
  function tokenize(s: string): string[] {
    return (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  }

  // Build catalog lookup structures
  const allCatalog = products as Array<{ code: string | null; barcode: string | null; name: string | null }>;
  const catalogSet = new Set<string>();
  for (const p of allCatalog) {
    const c = normSku(p.code);
    const b = normSku(p.barcode);
    if (c) catalogSet.add(c);
    if (b) catalogSet.add(b);
  }

  // Pattern detector for line-level fields (reuse the helper from enrichWithProviderLearning scope
  // by inlining it here — keeps this function self-contained).
  function fieldLineIndex(text: string | null | undefined): number | null {
    if (!text) return null;
    // " Line N" / " line N"
    const m1 = text.match(/(?:\s+line\s+|\s+l\s*\.?\s*)(\d+)/i);
    if (m1) return parseInt(m1[1], 10) - 1;
    // "line_item.N.X"
    const m2 = text.match(/line_item\.(\d+)\./i);
    if (m2) return parseInt(m2[1], 10);
    // "X_line_N" or "X_N" trailing
    const m3 = text.match(/(?:_line_|_)(\d+)$/i);
    if (m3) return parseInt(m3[1], 10) - 1;
    return null;
  }

  // Track per-column hit counts to decide if we should auto-create an annotation.
  // A column is the "true SKU column" if it provides catalog matches for most lines.
  const columnHits = new Map<string, { label: string; key: string; count: number }>();
  let swappedAny = false;

  for (let i = 0; i < normalized.line_items.length; i++) {
    const line = normalized.line_items[i];
    const currentSku = (line.sku ?? "").trim();

    // Already in catalog? Done — but first, scan alt_codes for a partner-recognized
    // code (one NOT in our catalog). When the AI puts our vendor SKU in `s` and the
    // buyer's code in `ac` (per the sku_resolution rules), we want to preserve the
    // buyer's code as customer_sku even though no swap was needed.
    if (currentSku && catalogSet.has(normSku(currentSku))) {
      if (!line.customer_sku) {
        const altCodesAll = (line as NormalizedLineItem & { alt_codes?: string[] }).alt_codes ?? [];
        const partnerCode = altCodesAll.find((c) => {
          const trimmed = (c ?? "").trim();
          if (!trimmed) return false;
          // Skip UPC/EAN/GTIN — pure-digit codes of length 12/13/14 are not partner SKUs.
          if (/^\d{12,14}$/.test(trimmed)) return false;
          // Must NOT be in our catalog (that's our own code, not the partner's).
          if (catalogSet.has(normSku(trimmed))) return false;
          // Must look like an item code (alphanum, length 4–32).
          if (trimmed.length < 4 || trimmed.length > 32) return false;
          return /[A-Z]/i.test(trimmed) || trimmed.length >= 6;
        });
        if (partnerCode) {
          normalized.line_items[i] = { ...line, customer_sku: partnerCode };
        }
      }
      continue;
    }

    // Strategy 0: provider_product_mappings lookup. Si el provider tiene mappings
    // registrados (sea por edición manual previa o por la UI de templates), usalos
    // antes que cualquier otra estrategia. Esto es lo que "entrena" al sistema:
    // una vez que un SKU del proveedor (ej. Zoro G306171142) se mapeó a uno propio
    // (GW904XL), todas las futuras órdenes lo resuelven solas.
    if (providerMappings.size > 0) {
      const altCodesAll = (line as NormalizedLineItem & { alt_codes?: string[] }).alt_codes ?? [];
      const candidates = [currentSku, ...altCodesAll].filter((c) => c && c.length > 0);
      let mappingHit: { companySku: string | null; defaultCode: string | null } | null = null;
      for (const code of candidates) {
        const hit = providerMappings.get(normSku(code));
        if (hit) {
          mappingHit = hit;
          break;
        }
      }
      if (mappingHit) {
        const newSku = mappingHit.defaultCode ?? mappingHit.companySku ?? currentSku;
        if (newSku && newSku !== currentSku) {
          // Preserve partner-recognized code as customer_sku before overwriting sku.
          normalized.line_items[i] = { ...line, sku: newSku, customer_sku: currentSku || line.customer_sku };
          swappedAny = true;
          continue;
        }
      }
    }

    let matched = false;

    // Strategy 1: scan line-level detected fields for catalog matches
    for (const field of detectedFields) {
      const fieldIdx = fieldLineIndex(field.label) ?? fieldLineIndex(field.key);
      const isThisLine =
        fieldIdx === i ||
        (fieldIdx === null && /line[_\s]*item|item[_\s]*number|part[_\s]*(no|number)|sku|product[_\s]*(code|number)|model[_\s]*(no|number)/i.test(`${field.label ?? ""} ${field.key ?? ""}`));
      if (!isThisLine) continue;

      const v = (field.value ?? "").trim();
      if (!v || normSku(v) === normSku(currentSku)) continue;

      if (catalogSet.has(normSku(v))) {
        // Preserve partner-recognized code (currentSku is the AI's original extraction).
        normalized.line_items[i] = { ...line, sku: v, customer_sku: currentSku || line.customer_sku };
        swappedAny = true;
        matched = true;
        const colKey = (field.label ?? field.key ?? "").replace(/\d+/g, "{N}");
        const existing = columnHits.get(colKey) ?? {
          label: field.label ?? field.key ?? "",
          key: field.key ?? "",
          count: 0,
        };
        existing.count++;
        columnHits.set(colKey, existing);
        break;
      }
    }

    if (matched) continue;

    // Strategy 1.5: scan the line's alt_codes (extra codes the AI captured).
    // This is the most reliable strategy when the AI followed our prompt and
    // captured all visible codes per line.
    const altCodes = (line as NormalizedLineItem & { alt_codes?: string[] }).alt_codes ?? [];
    let altMatched = false;
    for (const altCode of altCodes) {
      const norm = normSku(altCode);
      if (!norm || norm === normSku(currentSku)) continue;
      if (catalogSet.has(norm)) {
        normalized.line_items[i] = { ...line, sku: altCode, customer_sku: currentSku || line.customer_sku };
        swappedAny = true;
        altMatched = true;        break;
      }
    }
    if (altMatched) continue;

    // Strategy 2: scan inside the line's description for catalog tokens.
    // Many vendors embed the model code in the description text, e.g.:
    //   "GE 03 Series Safety Glasses (ANSI Certified GE203SAF) [QC:38244189]"
    const description = (line.description ?? "").trim();
    let descMatched = false;
    if (description) {
      const tokens = description
        .split(/[\s,;:()\[\]/\\"'`]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 4 && /[A-Z0-9]/i.test(t));

      for (const token of tokens) {
        const norm = normSku(token);
        if (!norm || norm === normSku(currentSku) || /^\d+$/.test(norm)) continue;
        if (catalogSet.has(norm)) {
          normalized.line_items[i] = { ...line, sku: token, customer_sku: currentSku || line.customer_sku };
          swappedAny = true;
          descMatched = true;          break;
        }
      }
    }
    if (descMatched) continue;

    // Strategy 3: fuzzy code match (Levenshtein distance ≤ 1) when exact fails.
    // Catches typos and OCR errors like "GE2O3" vs "GE203" (O vs 0).
    // Only auto-swap if there's EXACTLY ONE catalog code within distance 1.
    const tokensWithCurrent = description
      ? [...description.split(/[\s,;:()\[\]/\\"'`]+/).map((t) => t.trim()), currentSku]
      : [currentSku];
    const candidateTokens = tokensWithCurrent.filter((t) => t.length >= 4 && /[A-Z]/i.test(t));

    let fuzzyMatch: string | null = null;
    let fuzzyMatched = false;
    for (const token of candidateTokens) {
      const normTok = normSku(token);
      if (!normTok || /^\d+$/.test(normTok)) continue;
      const matches: string[] = [];
      for (const code of catalogSet) {
        if (Math.abs(code.length - normTok.length) > 1) continue;
        if (editDistance(normTok, code) <= 1) {
          matches.push(code);
          if (matches.length > 1) break;
        }
      }
      if (matches.length === 1) {
        // Find the original product code (un-normalized) for display
        const match = allCatalog.find((p) => normSku(p.code) === matches[0]);
        if (match?.code) {
          fuzzyMatch = match.code;
          break;
        }
      }
    }

    if (fuzzyMatch) {
      normalized.line_items[i] = { ...line, sku: fuzzyMatch, customer_sku: currentSku || line.customer_sku };
      swappedAny = true;
      fuzzyMatched = true;    }
    if (fuzzyMatched) continue;

    // Strategy 4: name match — find catalog products whose name shares meaningful
    // tokens with the line description. Only auto-swap if there's a UNIQUE match
    // with high token overlap (≥3 shared tokens or full prefix match).
    if (description.length >= 8) {
      const descTokens = new Set(tokenize(description));
      if (descTokens.size >= 2) {
        const candidates: Array<{ code: string; overlap: number }> = [];
        for (const p of allCatalog) {
          if (!p.code || !p.name) continue;
          const nameTokens = tokenize(p.name);
          let overlap = 0;
          for (const t of nameTokens) if (descTokens.has(t)) overlap++;
          if (overlap >= 3 || (overlap >= 2 && nameTokens.length <= 3)) {
            candidates.push({ code: p.code, overlap });
          }
        }
        if (candidates.length === 1) {
          const winner = candidates[0].code;
          normalized.line_items[i] = { ...line, sku: winner, customer_sku: currentSku || line.customer_sku };
          swappedAny = true;
        } else if (candidates.length > 1) {
          // Ambiguous matches — leave for user resolution.
          void candidates;
        }
      }
    }
  }

  // If we found a winning column for at least 1 line AND a provider is set,
  // auto-save an annotation so future docs skip detection.
  if (swappedAny && providerId && columnHits.size > 0) {
    const winner = [...columnHits.values()].sort((a, b) => b.count - a.count)[0];
    if (winner) {
      // Check if an annotation for this provider/target already exists
      const { data: existing } = await supabase
        .from("provider_field_annotations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider_id", providerId)
        .eq("target_field_key", "sku")
        .maybeSingle();

      if (!existing) {
        const { error: annErr } = await supabase.from("provider_field_annotations").insert({
          tenant_id: tenantId,
          provider_id: providerId,
          target_field_key: "sku",
          source_hint: winner.label,
          normalized_text: null,
          selection_meta: {
            extracted_key: winner.key,
            extracted_label: winner.label,
            auto_learned: true,
            learned_via: "catalog_match",
            line_count: winner.count,
          },
        });
        if (annErr) {
          console.error("[ai-process] auto-annotation save failed:", annErr.message);
        } else {        }
      }
    }
  }

  return { normalized, detectedFields };
}

async function enrichWithProviderLearning(params: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
  providerId: string;
  normalized: NormalizedOrder;
  detectedFields: DetectedField[];
}) {
  const { supabase, tenantId, providerId, detectedFields } = params;
  const normalized = { ...params.normalized };

  const [{ data: provider }, { data: history }, { data: annotations }] = await Promise.all([
    supabase
      .from("providers")
      .select("default_currency, settings")
      .eq("tenant_id", tenantId)
      .eq("id", providerId)
      .maybeSingle(),
    supabase
      .from("order_drafts")
      .select("id, currency, shipping_address, billing_address, notes")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .order("updated_at", { ascending: false })
      .limit(25),
    // Studio field annotations — teaches the system which document field maps to which Odoo field
    supabase
      .from("provider_field_annotations")
      .select("target_field_key, source_hint, normalized_text, selection_meta")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId),
  ]);

  const historyRows = (history ?? []) as Array<{
    id: string;
    currency: string | null;
    shipping_address: unknown;
    billing_address: unknown;
    notes: string | null;
  }>;

  const historyCurrencies = historyRows
    .map((row) => row.currency?.trim().toUpperCase() ?? null)
    .filter((value): value is string => Boolean(value && /^[A-Z]{3}$/.test(value)));
  const historyDelivery = historyRows
    .map((row) => readAddressLine(row.shipping_address))
    .filter((value): value is string => looksLikeUsefulAddress(value));
  const historyBilling = historyRows
    .map((row) => readAddressLine(row.billing_address))
    .filter((value): value is string => looksLikeUsefulAddress(value));
  const historyNotes = historyRows
    .map((row) => normalizeBlock(row.notes))
    .filter((value): value is string => Boolean(value && value.length >= 8));

  const providerSettings =
    provider && typeof provider.settings === "object" && provider.settings !== null
      ? (provider.settings as Record<string, unknown>)
      : {};
  const learned =
    providerSettings.learned_defaults &&
    typeof providerSettings.learned_defaults === "object" &&
    providerSettings.learned_defaults !== null
      ? (providerSettings.learned_defaults as Record<string, unknown>)
      : {};

  const learnedCurrency =
    typeof learned.currency === "string" ? learned.currency.trim().toUpperCase() : null;
  const learnedDelivery =
    typeof learned.delivery_address === "string" ? normalizeBlock(learned.delivery_address) : null;
  const learnedBilling =
    typeof learned.billing_address === "string" ? normalizeBlock(learned.billing_address) : null;
  const learnedPaymentTerms =
    typeof learned.payment_terms === "string" ? normalizeBlock(learned.payment_terms) : null;
  const learnedNotes = typeof learned.notes === "string" ? normalizeBlock(learned.notes) : null;

  const fallbackCurrency =
    learnedCurrency ??
    provider?.default_currency?.trim().toUpperCase() ??
    mostFrequent(historyCurrencies) ??
    "USD";
  if (!hasText(normalized.currency)) normalized.currency = fallbackCurrency;

  // Addresses (delivery & billing) are order-specific — never backfill from
  // provider history or learned defaults. If the document has no address the
  // field stays null so the reviewer can fill it manually.
  if (!hasText(normalized.notes)) {
    normalized.notes = learnedNotes ?? historyNotes[0] ?? null;
  }
  if (!hasText(normalized.payment_terms)) {
    normalized.payment_terms = learnedPaymentTerms ?? null;
  }

  if (!looksLikeUsefulAddress(normalized.customer_address)) {
    normalized.customer_address =
      normalized.billing_address ??
      normalized.delivery_address ??
      normalizeBlock(normalized.customer_address);
  }

  if (normalized.currency) {
    upsertInferredField(detectedFields, {
      key: "currency",
      label: "Currency",
      value: normalized.currency,
      path: "provider.learning.currency",
      category: "totals",
    });
  }
  // delivery_address and billing_address are NOT injected via provider learning.
  if (normalized.notes) {
    upsertInferredField(detectedFields, {
      key: "notes",
      label: "Notes",
      value: normalized.notes,
      path: "provider.learning.notes",
      category: "terms",
    });
  }
  if (normalized.payment_terms) {
    upsertInferredField(detectedFields, {
      key: "payment_terms",
      label: "Payment Terms",
      value: normalized.payment_terms,
      path: "provider.learning.payment_terms",
      category: "terms",
    });
  }

  // ── Apply Studio field annotations ─────────────────────────────────────
  // Each annotation teaches: "for THIS provider, Odoo field X always comes from
  // document field Y." When the mapped field is found in the current document,
  // its value OVERRIDES whatever the AI extracted — even if the AI already has
  // a value from a different column.
  //
  // Matching strategy (in priority order):
  //   1. Exact extracted_key match (most specific)
  //   2. Exact extracted_label match
  //   3. source_hint match (normalized, case-insensitive)
  //   4. Fuzzy label match (one contains the other, min 4 chars)

  function normalizeFieldLabel(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Detects line patterns in field labels/keys, e.g.:
  //   "Vendor Item Number Line 1" → { pattern: "Vendor Item Number Line {N}", index: 1, oneBased: true }
  //   "line_item.0.sku"            → { pattern: "line_item.{N}.sku",          index: 0, oneBased: false }
  //   "mfr_part_no_2"              → { pattern: "mfr_part_no_{N}",            index: 2, oneBased: true }
  function extractLinePattern(text: string | null | undefined):
    | { pattern: string; index: number; oneBased: boolean }
    | null {
    if (!text) return null;
    // " Line N" / " line N" suffix or middle (1-based)
    const lineN = text.match(/^(.*?)(\s+line\s+|\s+l\s*\.?\s*)(\d+)(\s*.*)$/i);
    if (lineN) {
      return {
        pattern: `${lineN[1]}${lineN[2]}{N}${lineN[4]}`,
        index: parseInt(lineN[3], 10),
        oneBased: true,
      };
    }
    // "line_item.N.X" prefix (0-based, common in AI extractions)
    const dotN = text.match(/^(line_item\.)(\d+)(\..*)$/i);
    if (dotN) {
      return {
        pattern: `${dotN[1]}{N}${dotN[3]}`,
        index: parseInt(dotN[2], 10),
        oneBased: false,
      };
    }
    // "X_line_N" or "X_N" trailing number (1-based)
    const trailN = text.match(/^(.*?)(_line_|_)(\d+)$/i);
    if (trailN) {
      return {
        pattern: `${trailN[1]}${trailN[2]}{N}`,
        index: parseInt(trailN[3], 10),
        oneBased: true,
      };
    }
    return null;
  }

  // For a line-level annotation, find each line's specific detected field by walking the pattern.
  // Returns an array of values indexed by line position (0-based), with null for lines without a match.
  function resolveLineValues(
    primaryMatch: DetectedField,
    lineCount: number,
  ): (string | null)[] {
    const labelPattern = extractLinePattern(primaryMatch.label);
    const keyPattern = extractLinePattern(primaryMatch.key);
    const result: (string | null)[] = new Array(lineCount).fill(null);

    if (!labelPattern && !keyPattern) {
      // No pattern detected — single value applies to all lines
      for (let i = 0; i < lineCount; i++) result[i] = primaryMatch.value?.trim() ?? null;
      return result;
    }

    for (let i = 0; i < lineCount; i++) {
      // Try both 0-based and 1-based interpretations to be safe
      const candidates: string[] = [];
      if (labelPattern) {
        candidates.push(labelPattern.pattern.replace("{N}", String(labelPattern.oneBased ? i + 1 : i)));
        candidates.push(labelPattern.pattern.replace("{N}", String(labelPattern.oneBased ? i : i + 1)));
      }
      if (keyPattern) {
        candidates.push(keyPattern.pattern.replace("{N}", String(keyPattern.oneBased ? i + 1 : i)));
        candidates.push(keyPattern.pattern.replace("{N}", String(keyPattern.oneBased ? i : i + 1)));
      }
      const normCandidates = candidates.map(normalizeFieldLabel);

      const found = detectedFields.find((f) => {
        const fLabelNorm = normalizeFieldLabel(f.label ?? "");
        const fKeyLower = (f.key ?? "").toLowerCase();
        return normCandidates.includes(fLabelNorm) || candidates.includes(fKeyLower);
      });

      if (found?.value?.trim()) result[i] = found.value.trim();
    }
    return result;
  }

  for (const annotation of annotations ?? []) {
    const meta = annotation.selection_meta as Record<string, unknown> | null;
    const extractedKey = typeof meta?.extracted_key === "string" ? meta.extracted_key : null;
    const extractedLabel = typeof meta?.extracted_label === "string" ? meta.extracted_label : null;
    const sourceHint = typeof annotation.source_hint === "string" ? annotation.source_hint : null;
    const normHint = sourceHint ? normalizeFieldLabel(sourceHint) : null;
    const normExtLabel = extractedLabel ? normalizeFieldLabel(extractedLabel) : null;

    // Find the matching detected field using cascading strategies
    const matchingField = detectedFields.find((f) => {
      const fKeyLower = f.key?.toLowerCase() ?? "";
      const fLabelNorm = normalizeFieldLabel(f.label ?? "");

      // 1. Exact key match
      if (extractedKey && fKeyLower === extractedKey.toLowerCase()) return true;
      // 2. Exact label match
      if (normExtLabel && fLabelNorm === normExtLabel) return true;
      // 3. source_hint match
      if (normHint && normHint.length >= 4 && fLabelNorm === normHint) return true;
      // 4. Fuzzy: label contains source_hint or vice versa (min 4 chars)
      if (normHint && normHint.length >= 4) {
        if (fLabelNorm.includes(normHint) || normHint.includes(fLabelNorm)) return true;
      }
      if (normExtLabel && normExtLabel.length >= 4) {
        if (fLabelNorm.includes(normExtLabel) || normExtLabel.includes(fLabelNorm)) return true;
      }
      return false;
    });

    const value = matchingField?.value?.trim() ?? null;
    if (!value) continue;

    const targetKey = annotation.target_field_key as string;
    // Map target_field_key → normalized property.
    // For LINE fields: ALWAYS override (annotation teaches which column is authoritative).
    // For HEADER fields: override AI extraction since the annotation is more specific.
    switch (targetKey) {
      case "client_order_ref":
      case "po_number":
        normalized.po_number = value;
        break;
      case "date_order":
        normalized.po_date = value;
        break;
      case "currency_id":
        normalized.currency = value.toUpperCase().slice(0, 3);
        break;
      case "payment_terms":
      case "payment_term_id":
        normalized.payment_terms = value;
        break;
      case "partner_id":
        normalized.customer_name = value;
        break;
      case "customer_address":
        normalized.customer_address = value;
        break;
      case "note":
        normalized.notes = value;
        break;
      case "sku": {
        // Per-line resolution: detect line pattern in the matched field
        // (e.g., "Vendor Item Number Line 1" → use Line N for line N).
        const perLine = resolveLineValues(matchingField!, normalized.line_items.length);
        normalized.line_items = normalized.line_items.map((line, idx) => ({
          ...line,
          sku: perLine[idx] ?? line.sku,
        }));
        break;
      }
      case "product_uom_qty": {
        const perLine = resolveLineValues(matchingField!, normalized.line_items.length);
        normalized.line_items = normalized.line_items.map((line, idx) => {
          const v = perLine[idx];
          return { ...line, quantity: v ? Number(v) || line.quantity : line.quantity };
        });
        break;
      }
      case "price_unit": {
        const perLine = resolveLineValues(matchingField!, normalized.line_items.length);
        normalized.line_items = normalized.line_items.map((line, idx) => {
          const v = perLine[idx];
          return { ...line, unit_price: v ? Number(v) || line.unit_price : line.unit_price };
        });
        break;
      }
      case "name": {
        const perLine = resolveLineValues(matchingField!, normalized.line_items.length);
        normalized.line_items = normalized.line_items.map((line, idx) => ({
          ...line,
          description: perLine[idx] ?? line.description,
        }));
        break;
      }
      case "product_uom": {
        const perLine = resolveLineValues(matchingField!, normalized.line_items.length);
        normalized.line_items = normalized.line_items.map((line, idx) => ({
          ...line,
          unit: perLine[idx] ?? line.unit,
        }));
        break;
      }
    }
  }

  const nextSettings = {
    ...providerSettings,
    learned_defaults: {
      currency: normalized.currency ?? fallbackCurrency,
      delivery_address: normalized.delivery_address ?? null,
      billing_address: normalized.billing_address ?? null,
      payment_terms: normalized.payment_terms ?? null,
      notes: normalized.notes ?? null,
      updated_at: new Date().toISOString(),
    },
  };

  await supabase
    .from("providers")
    .update({
      default_currency: normalized.currency ?? fallbackCurrency,
      settings: nextSettings,
    })
    .eq("tenant_id", tenantId)
    .eq("id", providerId);

  return { normalized, detectedFields };
}

function looksLikeCode(value: string) {
  // Short alphanumeric tokens (e.g. "GE205SAF", "SKU-100") are codes, not company names
  return value.length <= 20 && !value.includes(" ") && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function inferProviderName(normalized: NormalizedOrder, detectedFields: DetectedField[]) {
  // Our "providers" are the BUYERS who send us purchase orders.
  // Priority order:
  // 1. Buyer/purchaser/bill-to fields (the company that issued the PO to us)
  // 2. normalized.customer_name (extracted by AI as the customer/buyer)
  // 3. billing_name (company in the Bill To section)
  // We intentionally SKIP vendor/seller/supplier fields — those refer to US (DocFlow),
  // not to the provider (customer) we want to identify.

  const buyerField = detectedFields.find((field) => {
    const key = `${field.key} ${field.label}`.toLowerCase();
    const value = field.value.trim();
    return (
      value.length >= 3 &&
      !/^\d+$/.test(value) &&
      !looksLikeCode(value) &&
      (key.includes("buyer") ||
        key.includes("purchaser") ||
        key.includes("bill_to") ||
        key.includes("bill to") ||
        key.includes("billto") ||
        key.includes("ordered_by") ||
        key.includes("ship_from") ||
        key.includes("issued_by"))
    );
  });

  if (buyerField?.value) return buyerField.value.trim().slice(0, 120);
  if (hasText(normalized.customer_name)) return normalized.customer_name!.trim().slice(0, 120);

  // Last resort: billing_name from the normalized address block
  const billingName =
    normalized.billing_address &&
    typeof (normalized.billing_address as Record<string, unknown>).name === "string"
      ? ((normalized.billing_address as Record<string, unknown>).name as string).trim()
      : null;
  if (billingName && billingName.length >= 3) return billingName.slice(0, 120);

  return null;
}

function targetCandidates(target: TargetFieldRow) {
  const byKey: Record<string, string[]> = {
    partner_id: ["customer_name", "supplier_name", "buyer_name"],
    client_order_ref: ["po_number", "purchase_order", "order_number", "invoice_id"],
    date_order: ["po_date", "purchase_order_date", "order_date", "invoice_date"],
    commitment_date: ["delivery_date", "estimated_delivery_date", "do_not_deliver_after", "requested_delivery_date"],
    currency_id: ["currency", "currency_code"],
    note: ["notes", "note", "payment_terms", "additional_notes"],
    partner_shipping_id: ["delivery_address", "shipping_address", "ship_to.address"],
    partner_invoice_id: ["billing_address", "bill_to.address", "invoice_to.address"],
    shipping_street: ["delivery_address", "shipping_address", "ship_to.address"],
    shipping_city: ["ship_to.city", "delivery_city"],
    shipping_state: ["ship_to.state", "delivery_state"],
    shipping_zip: ["ship_to.zip", "delivery_zip", "delivery_postal_code"],
    shipping_country: ["ship_to.country", "delivery_country"],
    billing_street: ["billing_address", "bill_to.address", "invoice_to.address"],
    billing_city: ["bill_to.city", "billing_city"],
    billing_state: ["bill_to.state", "billing_state"],
    billing_zip: ["bill_to.zip", "billing_zip", "billing_postal_code"],
    billing_country: ["bill_to.country", "billing_country"],
    product_id: [
      "line_item.product_code",
      "line_item.item_code",
      "line_item.sku",
      "line_item.customer_part_number",
    ],
    product_uom_qty: ["line_item.quantity", "quantity"],
    price_unit: ["line_item.unit_price", "line_item.price", "unit_price"],
    name: ["line_item.description", "description", "line_item.name"],
    tax_id: ["line_item.tax_rate", "line_item.tax", "tax_rate"],
    product_uom: ["line_item.unit", "unit"],
    discount: ["line_item.discount", "discount"],
    customer_lead: ["line_item.lead_time", "lead_time"],
    analytic_distribution: ["line_item.analytic_distribution", "analytic_distribution"],
  };

  const explicit = byKey[target.key] ?? [];
  const fromOdooField =
    target.target_field && target.target_field !== target.key
      ? [safeFieldKey(target.target_field), target.target_field.toLowerCase()]
      : [];
  return [...explicit, ...fromOdooField].map((value) => safeFieldKey(value));
}

function collectAvailableSourceFields(
  normalized: NormalizedOrder,
  detectedFields: DetectedField[],
) {
  const values = new Map<string, { key: string; label: string }>();

  const add = (key: string, label: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string" && !value.trim()) return;
    values.set(safeFieldKey(key), { key: safeFieldKey(key), label });
  };

  add("po_number", "PO Number", normalized.po_number);
  add("po_date", "PO Date", normalized.po_date);
  add("currency", "Currency", normalized.currency);
  add("customer_name", "Customer", normalized.customer_name);
  add("customer_address", "Customer Address", normalized.customer_address);
  add("delivery_address", "Delivery Address", normalized.delivery_address);
  add("billing_address", "Billing Address", normalized.billing_address);
  add("notes", "Notes", normalized.notes);

  const lineHas = (selector: (line: NormalizedOrder["line_items"][number]) => unknown) =>
    normalized.line_items.some((line) => {
      const value = selector(line);
      return value !== null && value !== undefined && !(typeof value === "string" && !value.trim());
    });

  if (lineHas((line) => line.description)) add("line_item.description", "Line Description", true);
  if (lineHas((line) => line.quantity)) add("line_item.quantity", "Line Quantity", true);
  if (lineHas((line) => line.unit_price)) add("line_item.unit_price", "Unit Price", true);
  if (lineHas((line) => line.sku)) add("line_item.sku", "Line SKU", true);
  if (lineHas((line) => line.unit)) add("line_item.unit", "Line Unit", true);
  if (lineHas((line) => line.tax_rate)) add("line_item.tax_rate", "Line Tax", true);

  for (const field of detectedFields) {
    if (!field.value.trim()) continue;
    values.set(safeFieldKey(field.key), {
      key: safeFieldKey(field.key),
      label: field.label || field.key,
    });
  }

  return values;
}

function detectDocumentKind(
  normalized: NormalizedOrder,
  detectedFields: DetectedField[],
): DocumentKind {
  const corpus = [
    normalized.notes ?? "",
    normalized.po_number ?? "",
    ...detectedFields.map((field) => `${field.key} ${field.label} ${field.value}`),
  ]
    .join(" ")
    .toLowerCase();

  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(corpus));

  if (
    has([
      /\binvoice\b/,
      /\bbill\b/,
      /\baccount\.move\b/,
      /\btotal amount due\b/,
      /\binvoice date\b/,
    ]) &&
    !has([/\bpurchase order\b/, /\bpo number\b/])
  ) {
    return "invoice";
  }
  if (has([/\bship to\b/, /\bdelivery date\b/, /\btracking\b/, /\bcarrier\b/, /\bpicking\b/])) {
    return "shipping";
  }
  if (has([/\breceipt\b/, /\breceived\b/, /\bpayment received\b/, /\bcash\b/])) {
    return "receipt";
  }
  if (has([/\bpurchase order\b/, /\bpo number\b/, /\bclient_order_ref\b/])) {
    return "purchase_order";
  }
  return "custom";
}

async function resolveReviewProfile(params: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
  documentKind: DocumentKind;
}) {
  const { supabase, tenantId, documentKind } = params;
  const { data: exact } = await supabase
    .from("review_profiles")
    .select("id, slug, document_kind")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .eq("document_kind", documentKind)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (exact?.id) {
    return {
      reviewProfileId: exact.id as string,
      reviewProfileSlug: String(exact.slug ?? ""),
      resolvedDocumentKind: documentKind,
    };
  }

  const { data: fallback } = await supabase
    .from("review_profiles")
    .select("id, slug, document_kind")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .eq("document_kind", "purchase_order")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallback?.id) {
    return {
      reviewProfileId: fallback.id as string,
      reviewProfileSlug: String(fallback.slug ?? ""),
      resolvedDocumentKind: "purchase_order" as DocumentKind,
    };
  }

  return {
    reviewProfileId: null,
    reviewProfileSlug: null,
    resolvedDocumentKind: documentKind,
  };
}

async function ensureProviderTemplate(params: {
  supabase: ReturnType<typeof createServiceClient>;
  tenantId: string;
  document: { id: string; original_name: string; provider_id: string | null };
  normalized: NormalizedOrder;
  detectedFields: DetectedField[];
  reviewProfileId?: string | null;
}) {
  const { supabase, tenantId, document, normalized, detectedFields, reviewProfileId } = params;
  const availableSourceFields = collectAvailableSourceFields(normalized, detectedFields);

  let providerId = document.provider_id;

  if (!providerId) {
    // Robust provider detection: search ALL extracted text from the document
    // for any known provider name. Works regardless of how the AI labeled the field
    // (could be "billing_address", "buyer", "customer_name", "header_text", etc.)
    const { data: allProviders, error: providersErr } = await supabase
      .from("providers")
      .select("id, name, code, settings")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    if (providersErr) {
      console.error("[ai-process] providers query failed:", providersErr.message);
    }

    if (allProviders && allProviders.length > 0) {
      // Build one big text blob from EVERYTHING extracted
      const textPieces: string[] = [];
      if (typeof normalized.customer_name === "string") textPieces.push(normalized.customer_name);
      if (typeof normalized.customer_address === "string") textPieces.push(normalized.customer_address);
      if (typeof normalized.delivery_name === "string") textPieces.push(normalized.delivery_name);
      if (typeof normalized.delivery_contact_person === "string") textPieces.push(normalized.delivery_contact_person);
      if (typeof normalized.billing_name === "string") textPieces.push(normalized.billing_name);
      if (typeof normalized.billing_contact_person === "string") textPieces.push(normalized.billing_contact_person);
      if (typeof normalized.customer_contact_person === "string") textPieces.push(normalized.customer_contact_person);
      if (typeof normalized.delivery_address === "string") textPieces.push(normalized.delivery_address);
      if (typeof normalized.billing_address === "string") textPieces.push(normalized.billing_address);
      if (typeof normalized.notes === "string") textPieces.push(normalized.notes);

      // JSON-stringify nested address objects (they may contain the company name)
      for (const key of ["delivery_address", "billing_address", "shipping_address"] as const) {
        const v = (normalized as unknown as Record<string, unknown>)[key];
        if (v && typeof v === "object") textPieces.push(JSON.stringify(v));
      }

      // Plus every detected field's value AND label (label often contains supplier name)
      for (const f of detectedFields) {
        if (f.value) textPieces.push(f.value);
        if (f.label) textPieces.push(f.label);
      }

      const haystack = textPieces.join(" | ").toLowerCase();

      // Find the longest matching provider name (more specific wins)
      let bestMatch: { id: string; name: string } | null = null;
      let bestLength = 0;

      for (const p of allProviders) {
        const pName = ((p.name as string) ?? "").toLowerCase().trim();
        const pCode = ((p.code as string) ?? "").toLowerCase().trim();

        // Build all search terms: name + code + aliases from settings
        const settings = p.settings as Record<string, unknown> | null;
        const rawAliases = settings?.aliases;
        const aliases: string[] = Array.isArray(rawAliases)
          ? rawAliases.map((a) => String(a ?? "").toLowerCase().trim()).filter((a) => a.length >= 3)
          : [];

        const terms: Array<{ term: string; len: number }> = [
          { term: pName, len: pName.length },
          { term: pCode, len: pCode.length },
          ...aliases.map((a) => ({ term: a, len: a.length })),
        ].filter((t) => t.len >= 3);

        for (const { term, len } of terms) {
          if (len > bestLength && haystack.includes(term)) {
            bestMatch = { id: p.id as string, name: p.name as string };
            bestLength = len;
            break;
          }
        }
      }

      if (bestMatch) {
        providerId = bestMatch.id;      } else {
        // Fallback: use inferProviderName + fuzzy matching (legacy path)
        const providerName = inferProviderName(normalized, detectedFields);
        const name = providerName ? providerName.slice(0, 120) : null;
        if (name) {
          const nameLower = name.toLowerCase().trim();
          const nameSlug = slugify(name);
          const matched = allProviders.find((p) => {
            const pName = ((p.name as string) ?? "").toLowerCase().trim();
            const pCode = ((p.code as string) ?? "").toLowerCase().trim();
            if (pCode && pCode === nameSlug) return true;
            if (pName === nameLower) return true;
            if (nameLower.includes(pName) && pName.length >= 4) return true;
            if (pName.includes(nameLower) && nameLower.length >= 4) return true;
            return false;
          });
          providerId = (matched as { id: string } | undefined)?.id ?? null;
          if (providerId) {          }
        }
      }
    }
  }

  if (!providerId) {
    return {
      providerId: null,
      mappedCount: 0,
      unmappedSourceFields: Array.from(availableSourceFields.values()),
      detectionStatus: "unresolved" as const,
    };
  }

  await supabase
    .from("documents")
    .update({ provider_id: providerId })
    .eq("id", document.id)
    .eq("tenant_id", tenantId);

  let targetFieldsQuery = supabase
    .from("target_fields")
    .select("id, key, label, target_field, active")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (reviewProfileId) {
    targetFieldsQuery = targetFieldsQuery.eq("review_profile_id", reviewProfileId);
  }

  const { data: targetFields, error: targetFieldError } = await targetFieldsQuery;

  if (targetFieldError) throw new Error(`target_fields query failed: ${targetFieldError.message} (code=${targetFieldError.code})`);

  const usedSources = new Set<string>();
  const mappingRows = (targetFields ?? [])
    .map((target) => {
      const candidates = targetCandidates(target as TargetFieldRow);
      const source = candidates.find((candidate) => availableSourceFields.has(candidate));
      if (!source) return null;

      usedSources.add(source);
      const sourceInfo = availableSourceFields.get(source);
      return {
        tenant_id: tenantId,
        provider_id: providerId,
        target_field_id: (target as TargetFieldRow).id,
        source_field_key: source,
        source_field_label: sourceInfo?.label ?? source,
        active: true,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (mappingRows.length > 0) {
    const { error: mappingsError } = await supabase
      .from("provider_field_mappings")
      .upsert(mappingRows, { onConflict: "provider_id,target_field_id" });
    if (mappingsError) throw mappingsError;
  }

  const unmappedSourceFields = Array.from(availableSourceFields.values()).filter(
    (field) => !usedSources.has(field.key),
  );

  return {
    providerId,
    mappedCount: mappingRows.length,
    unmappedSourceFields,
    detectionStatus: "resolved" as const,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = performance.now();

  let payload: AiProcessPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { document_id: documentId, tenant_id: tenantId } = payload;
  const runId = validUuid(payload.run_id) ? payload.run_id : crypto.randomUUID();

  if (!validUuid(documentId) || !validUuid(tenantId)) {
    return json({ error: "Invalid document_id or tenant_id" }, 400);
  }

  const supabase = createServiceClient();

  // ── 1. Load document ───────────────────────────────────────────────────────
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id, tenant_id, state, original_name, storage_path, mime_type, provider_id, page_count, uploaded_by, size_bytes, meta, source_channel")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (docError || !document) {
    return json({ error: "Document not found" }, 404);
  }

  if (document.state !== "processing") {
    return json({ error: `Document in unexpected state: ${document.state}` }, 409);
  }

  // ── Idempotency guard ──────────────────────────────────────────────────
  // If we already started ai_process_start for this run_id, this is a duplicate
  // invocation (retry, network re-send). Return 200 OK so the caller is happy
  // but DON'T re-extract — that would waste Anthropic credits.
  const { data: existingStart } = await supabase
    .from("workflow_events")
    .select("id")
    .eq("document_id", documentId)
    .eq("tenant_id", tenantId)
    .eq("run_id", runId)
    .eq("stage", "ai_process_start")
    .limit(1);
  if (existingStart && existingStart.length > 0) {
    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ai_process_skipped_duplicate",
      outcome: "skip",
      meta: { reason: "run_id_already_processed" },
    });
    return json({ ok: true, skipped: "duplicate_run" });
  }

  try {
    // ── 2. Fetch PDF from Storage ──────────────────────────────────────────
    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ai_process_start",
      outcome: "ok",
      meta: { mode: "real" },
    });

    const { data: fileData, error: storageError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);

    if (storageError || !fileData) {
      throw new Error(`Storage download failed: ${storageError?.message}`);
    }

    let fileBytes = await fileData.arrayBuffer();
    const mimeType = document.mime_type ?? "application/pdf";

    // ── 2a. Combined boundary + orientation analysis (single Haiku call) ──
    // For PDFs, ONE Haiku call returns both:
    //   - document boundaries (which pages belong to which document)
    //   - per-page rotation correction (so sideways scans display upright)
    // Children of a previous split skip this — already analyzed upstream.
    const isSplitChild =
      document.meta &&
      typeof document.meta === "object" &&
      "parent_document_id" in (document.meta as Record<string, unknown>);

    if (mimeType === "application/pdf") {
      let pdfBytes = new Uint8Array(fileBytes);
      const knownPageCount = typeof document.page_count === "number" && document.page_count > 0
        ? document.page_count
        : await getPdfPageCount(pdfBytes);

      // Boundary detection vía Haiku. Solo tiene sentido en PDFs multi-página:
      // un PDF de 1 página es 1 documento por definición, así que saltamos el
      // roundtrip a Anthropic y nos ahorramos el prompt entero. Tampoco se llama
      // si este job ya es un hijo de split (el padre ya hizo la detección).
      let boundaries: import("../_shared/boundary-detection.ts").DocumentBoundary[] | null = null;

      if (knownPageCount > 1 && !isSplitChild) {
        const fileBase64Early = arrayBufferToBase64(fileBytes);
        boundaries = await detectDocumentBoundaries(
          secrets.anthropicApiKey,
          fileBase64Early,
          mimeType,
          knownPageCount,
        );
      }

      // ── 2b. Multi-document split (fan-out) ───────────────────────────────
      if (knownPageCount > 1 && boundaries) {

        if (boundaries.length > 1) {
          await emitWorkflowEvent({
            tenantId,
            documentId,
            runId,
            stage: "split_detected",
            outcome: "ok",
            meta: { split_count: boundaries.length, page_count: knownPageCount },
          });

          // Build storage path prefix (same folder as parent)
          const pathParts = document.storage_path.split("/");
          const folder = pathParts.slice(0, -1).join("/");
          const baseName = document.original_name.replace(/\.pdf$/i, "");

          // Extract each page range, upload, create document, queue
          const childJobs = boundaries.map(async (boundary, idx) => {
            const splitIndex = idx + 1;
            // Format: "1_Original name.pdf", "2_Original name.pdf", etc.
            const childName = `${splitIndex}_${baseName}.pdf`;

            // Extract page range
            const childPdfBytes = await extractPageRange(
              pdfBytes,
              boundary.page_start,
              boundary.page_end,
            );

            // Upload child PDF to Storage
            const childId = crypto.randomUUID();
            const childPath = `${folder}/${childId}.pdf`;
            const { error: uploadErr } = await supabase.storage
              .from("documents")
              .upload(childPath, childPdfBytes, {
                contentType: "application/pdf",
                upsert: false,
              });

            if (uploadErr) {
              console.error(`[ai-process] Failed to upload child ${splitIndex}:`, uploadErr.message);
              return null;
            }

            // Create child document row
            const { data: childDoc, error: insertErr } = await supabase
              .from("documents")
              .insert({
                id: childId,
                tenant_id: tenantId,
                uploaded_by: document.uploaded_by,
                original_name: childName,
                storage_path: childPath,
                mime_type: "application/pdf",
                size_bytes: childPdfBytes.byteLength,
                state: "uploaded",
                page_count: boundary.page_end - boundary.page_start + 1,
                provider_id: document.provider_id ?? null,
                meta: {
                  parent_document_id: documentId,
                  split_index: splitIndex,
                  split_total: boundaries.length,
                  split_page_start: boundary.page_start,
                  split_page_end: boundary.page_end,
                  split_document_type: boundary.document_type,
                  split_identifier: boundary.identifier,
                },
              })
              .select("id")
              .single();

            if (insertErr || !childDoc) {
              console.error(`[ai-process] Failed to insert child doc ${splitIndex}:`, insertErr?.message);
              return null;
            }

            // Trigger ingest → ai-process for the child. AWAITED with timeout so
            // the Deno isolate doesn't kill the worker before the request ships.
            try {
              await awaitedInvoke("ingest", { document_id: childId, tenant_id: tenantId });
              await emitWorkflowEvent({
                tenantId, documentId, runId,
                stage: "child_dispatch_ok",
                outcome: "ok",
                meta: { child_id: childId, split_index: splitIndex },
              });
            } catch (dispatchErr) {
              await emitWorkflowEvent({
                tenantId, documentId, runId,
                stage: "child_dispatch_failed",
                outcome: "fail",
                errorCode: "child_dispatch_error",
                meta: {
                  child_id: childId,
                  split_index: splitIndex,
                  error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
                },
              });
              return null;
            }

            return childId;
          });

          // Run all child dispatches in parallel; one slow child must NOT kill the parent.
          const childResults = await Promise.allSettled(childJobs);
          const childIds = childResults
            .map((r) => (r.status === "fulfilled" ? r.value : null))
            .filter((id): id is string => Boolean(id));

          // Mark parent as "split" — it won't appear as a reviewable item.
          // If this fails after children are queued, rollback to failed_processing
          // so the parent is visible/recoverable; children continue independently.
          const { error: parentUpdErr } = await supabase
            .from("documents")
            .update({
              state: "split",
              meta: {
                split_count: boundaries.length,
                split_child_ids: childIds,
                page_count: knownPageCount,
              },
            })
            .eq("id", documentId)
            .eq("tenant_id", tenantId);

          if (parentUpdErr) {
            console.error(
              "[ai-process] Parent split state update failed:",
              parentUpdErr.message,
            );
            await supabase
              .from("documents")
              .update({
                state: "failed_processing",
                last_error: `Split parent state update failed: ${parentUpdErr.message}`.slice(0, 500),
              })
              .eq("id", documentId)
              .eq("tenant_id", tenantId);
            return json(
              {
                ok: false,
                error: "split_parent_update_failed",
                detail: parentUpdErr.message,
                child_ids: childIds,
              },
              500,
            );
          }

          await emitWorkflowEvent({
            tenantId,
            documentId,
            runId,
            stage: "split_complete",
            outcome: "ok",
            meta: { split_count: boundaries.length, queued: childIds.length },
          });

          return json({
            ok: true,
            document_id: documentId,
            split: true,
            split_count: boundaries.length,
            child_ids: childIds,
          });
        }

        // ── 2c. Merge single-doc multi-page into one tall page ─────────────
        // Makes the viewer show one page and gives the AI full context at once.
        // Only applies when boundary detection confirmed this is a single document.
        if (boundaries.length <= 1) {
          const merged = await mergePagesTall(pdfBytes);
          if (merged.length !== pdfBytes.length) {
            pdfBytes = merged;
            fileBytes = merged.buffer as ArrayBuffer;
            const { error: upErr } = await supabase.storage
              .from("documents")
              .update(document.storage_path, merged, {
                contentType: "application/pdf",
                upsert: true,
              });
            if (!upErr) {
              await supabase
                .from("documents")
                .update({ page_count: 1 })
                .eq("id", documentId)
                .eq("tenant_id", tenantId);
            }
          }
        }
      }
    }

    // ── 3. Extraction (Anthropic multimodal only) ─────────────────────────
    let normalized: NormalizedOrder;
    let selectedMethod: ExtractionCandidate["method"] = "anthropic_multimodal";
    const methodsTried: string[] = [];
    const extractionCandidates: ExtractionCandidate[] = [];
    const fileBase64 = arrayBufferToBase64(fileBytes);
    const aiConfig = await loadAiRuntimeConfig({ supabase, tenantId });

    const normalizeText = normalizeTextWithAnthropic;
    const normalizePdf = normalizePdfWithAnthropic;

    // ── 3a-pre. Load our SKU catalog ───────────────────────────────────────
    // Inject as a second system block so the model knows OUR codes upfront
    // and picks them over buyer/manufacturer alternatives. Also reused below
    // to auto-resolve odoo_product_id when inserting lines.
    let ourSkus: string[] | undefined;
    let productByCode: Map<string, { id: number; name: string | null }> | undefined;
    {
      const { data: ourProducts } = await supabase
        .from("odoo_products")
        .select("odoo_product_id, default_code, name")
        .eq("tenant_id", tenantId)
        .eq("active", true);
      const rows = (ourProducts ?? []) as Array<{
        odoo_product_id: number;
        default_code: string | null;
        name: string | null;
      }>;
      const codes: string[] = [];
      productByCode = new Map();
      for (const r of rows) {
        if (!r.default_code) continue;
        const code = r.default_code.trim();
        if (!code) continue;
        codes.push(code);
        productByCode.set(code.toUpperCase(), { id: r.odoo_product_id, name: r.name });
      }
      if (codes.length > 0) ourSkus = codes;
    }

    // ── 3a. Load provider hints from saved annotations ─────────────────────
    let providerHints: string | undefined;
    if (document.provider_id) {
      const { data: annotations } = await supabase
        .from("provider_field_annotations")
        .select("target_field_key, source_hint, normalized_text")
        .eq("tenant_id", tenantId)
        .eq("provider_id", document.provider_id);

      if (annotations && annotations.length > 0) {
        providerHints = [
          "Known field mappings for this provider (use as extraction hints):",
          ...annotations.map(
            (a: {
              target_field_key: string;
              source_hint: string | null;
              normalized_text: string | null;
            }) =>
              `- ${a.target_field_key}: look for "${a.source_hint ?? ""}" (example value: "${a.normalized_text ?? ""}")`,
          ),
        ].join("\n");
      }
    }

    const isExcel = isExcelMimeOrName(mimeType, document.original_name);

    if (mimeType === "text/html" || mimeType === "text/plain" || isExcel) {
      let text: string;
      if (isExcel) {
        text = excelToText(fileBytes);
      } else {
        const rawText = new TextDecoder().decode(fileBytes);
        text = mimeType === "text/html" ? htmlToText(rawText) : rawText;
      }
      normalized = await normalizeText(
        aiConfig.apiKey,
        text,
        document.original_name,
        {
          primaryModel: aiConfig.primaryModel,
          fallbackModel: aiConfig.fallbackModel,
        },
        providerHints,
        ourSkus,
      );
      const evalResult = evaluateNormalizedOrder(normalized);
      const textMethod: ExtractionCandidate["method"] = "email_body_anthropic";
      const textUsage = consumeAnthropicUsageSummary();
      const textCostUsd = textUsage
        ? estimateAnthropicCostUsd({
            model: aiConfig.primaryModel,
            inputTokens: textUsage.totalInputTokens,
            outputTokens: textUsage.totalOutputTokens,
          })
        : null;
      extractionCandidates.push({
        method: textMethod,
        normalized,
        issues: evalResult.issues,
        score: evalResult.score,
        usage: textUsage
          ? {
              input_tokens: textUsage.totalInputTokens,
              output_tokens: textUsage.totalOutputTokens,
              cost_usd: textCostUsd,
            }
          : undefined,
      });
      methodsTried.push(textMethod);

      await emitWorkflowEvent({
        tenantId,
        documentId,
        runId,
        stage: "ai_text_complete",
        outcome: "ok",
        meta: {
          provider: aiConfig.provider,
          model: aiConfig.primaryModel,
          input_tokens: textUsage?.totalInputTokens ?? null,
          output_tokens: textUsage?.totalOutputTokens ?? null,
          cost_usd: textCostUsd,
          confidence: normalized.confidence,
          score: evalResult.score,
          issue_count: evalResult.issues.length,
        },
      });
    } else {
      const multimodalMethod: ExtractionCandidate["method"] = "anthropic_multimodal";
      try {
        // Retry up to 3x on transient 529 overload before giving up.
        let multimodal!: Awaited<ReturnType<typeof normalizePdf>>;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            multimodal = await normalizePdf(
              aiConfig.apiKey,
              fileBase64,
              mimeType,
              document.original_name,
              {
                primaryModel: aiConfig.primaryModel,
                fallbackModel: aiConfig.fallbackModel,
              },
              providerHints,
              ourSkus,
            );
            break;
          } catch (attemptErr) {
            const msg = String(attemptErr);
            const isOverloaded = msg.includes("529") || msg.toLowerCase().includes("overloaded");
            if (isOverloaded && attempt < 3) {
              await new Promise((r) => setTimeout(r, attempt * 4000));
              continue;
            }
            throw attemptErr;
          }
        }
        const evalResult = evaluateNormalizedOrder(multimodal);
        const multimodalUsage = consumeAnthropicUsageSummary();
        const multimodalCostUsd = multimodalUsage
          ? estimateAnthropicCostUsd({
              model: aiConfig.primaryModel,
              inputTokens: multimodalUsage.totalInputTokens,
              outputTokens: multimodalUsage.totalOutputTokens,
            })
          : null;

        extractionCandidates.push({
          method: multimodalMethod,
          normalized: multimodal,
          issues: evalResult.issues,
          score: evalResult.score,
          usage: multimodalUsage
            ? {
                input_tokens: multimodalUsage.totalInputTokens,
                output_tokens: multimodalUsage.totalOutputTokens,
                cost_usd: multimodalCostUsd,
              }
            : undefined,
        });
        methodsTried.push(multimodalMethod);

        await emitWorkflowEvent({
          tenantId,
          documentId,
          runId,
          stage: "ai_multimodal_complete",
          outcome: "ok",
          meta: {
            provider: aiConfig.provider,
            model: aiConfig.primaryModel,
            input_tokens: multimodalUsage?.totalInputTokens ?? null,
            output_tokens: multimodalUsage?.totalOutputTokens ?? null,
            cost_usd: multimodalCostUsd,
            confidence: multimodal.confidence,
            score: evalResult.score,
            issue_count: evalResult.issues.length,
            mime_type: mimeType,
          },
        });
      } catch (multimodalError) {
        methodsTried.push(multimodalMethod);
        await emitWorkflowEvent({
          tenantId,
          documentId,
          runId,
          stage: "ai_multimodal_failed",
          outcome: "fail",
          errorCode: "ai_multimodal_error",
          meta: {
            provider: aiConfig.provider,
            model: aiConfig.primaryModel,
            error: String(multimodalError),
            mime_type: mimeType,
          },
        });
        throw multimodalError;
      }
    }

    if (!extractionCandidates.length) {
      throw new Error("All extraction methods failed");
    }

    const chosen = pickBestCandidate(extractionCandidates);
    normalized = chosen.normalized;
    selectedMethod = chosen.method;

    let detectedFields = mergeDetectedFields(normalized.detected_fields);
    const enriched = enrichNormalizedOrder({
      normalized,
      detectedFields,
    });
    normalized = enriched.normalized;
    detectedFields = enriched.detectedFields;
    normalized = { ...normalized, detected_fields: detectedFields };

    const detectedDocumentKind = detectDocumentKind(normalized, detectedFields);
    const reviewProfile = await resolveReviewProfile({
      supabase,
      tenantId,
      documentKind: detectedDocumentKind,
    });
    const documentKind = reviewProfile.resolvedDocumentKind;
    const reviewProfileId = reviewProfile.reviewProfileId;

    await supabase
      .from("documents")
      .update({
        document_kind: documentKind,
        review_profile_id: reviewProfileId,
      })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    const autoTemplate = await ensureProviderTemplate({
      supabase,
      tenantId,
      document: {
        id: document.id,
        original_name: document.original_name,
        provider_id: document.provider_id,
      },
      normalized,
      detectedFields,
      reviewProfileId,
    });

    if (autoTemplate.providerId) {
      const providerEnriched = await enrichWithProviderLearning({
        supabase,
        tenantId,
        providerId: autoTemplate.providerId,
        normalized,
        detectedFields,
      });
      normalized = providerEnriched.normalized;
      detectedFields = providerEnriched.detectedFields;
    }

    // Catalog-aware SKU detection: works regardless of provider annotations.
    // Scans every line's fields against the customer's product catalog and swaps
    // in the field whose value is a real catalog SKU. If a provider IS set and
    // a winning column is found, an annotation is auto-saved for next time.
    {
      const catalogResult = await applyCatalogSkuDetection({
        supabase,
        tenantId,
        providerId: autoTemplate.providerId,
        normalized,
        detectedFields,
      });
      normalized = catalogResult.normalized;
      detectedFields = catalogResult.detectedFields;
    }

    if (autoTemplate.providerId) {
      normalized = { ...normalized, detected_fields: detectedFields };
    }
    // ── 5. Update page count on document ──────────────────────────────────
    const pageCount = document.page_count || 1;
    const extractionBenchmarks = extractionCandidates.map((candidate) =>
      estimateMethodBenchmark({ candidate, pageCount }),
    );
    const selectedBenchmark =
      extractionBenchmarks.find((item) => item.method === selectedMethod) ?? null;
    const selectedCandidate =
      extractionCandidates.find((candidate) => candidate.method === selectedMethod) ?? null;
    const totalInputTokens = extractionCandidates.reduce(
      (sum, candidate) => sum + (candidate.usage?.input_tokens ?? 0),
      0,
    );
    const totalOutputTokens = extractionCandidates.reduce(
      (sum, candidate) => sum + (candidate.usage?.output_tokens ?? 0),
      0,
    );
    const actualExtractionCostUsd = extractionCandidates.reduce(
      (sum, candidate) => sum + (candidate.usage?.cost_usd ?? 0),
      0,
    );
    await supabase
      .from("documents")
      .update({ page_count: pageCount })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    // ── 6. Upsert page records ────────────────────────────────────────────
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      tenant_id: tenantId,
      document_id: documentId,
      page_number: i + 1,
      page_type: "body",
      is_relevant: true,
      confidence: normalized.confidence,
      meta: { mode: "real" },
    }));

    await supabase.from("document_pages").upsert(pages, { onConflict: "document_id,page_number" });

    // ── 7. Save extraction ────────────────────────────────────────────────
    await supabase
      .from("extractions")
      .update({ current: false })
      .eq("document_id", documentId)
      .eq("tenant_id", tenantId)
      .eq("current", true);

    const { data: extraction, error: extractionError } = await supabase
      .from("extractions")
      .insert({
        tenant_id: tenantId,
        document_id: documentId,
        run_id: runId,
        payload: {
          mode: "real",
          source: selectedMethod === "anthropic_multimodal"
            ? "anthropic-multimodal"
            : "email-body+anthropic",
          extraction_method: selectedMethod,
          extraction_methods_tried: methodsTried,
          extraction_method_benchmarks: extractionBenchmarks,
          selected_method_benchmark: selectedBenchmark,
          ai_usage: {
            total_input_tokens: totalInputTokens,
            total_output_tokens: totalOutputTokens,
            selected_method_input_tokens: selectedCandidate?.usage?.input_tokens ?? null,
            selected_method_output_tokens: selectedCandidate?.usage?.output_tokens ?? null,
            actual_cost_usd: actualExtractionCostUsd > 0 ? actualExtractionCostUsd : null,
          },
          detected_fields: detectedFields,
          detected_field_count: detectedFields.length,
          provider_template: {
            provider_id: autoTemplate.providerId,
            detection_status: autoTemplate.detectionStatus,
            mapped_count: autoTemplate.mappedCount,
            unmapped_source_fields: autoTemplate.unmappedSourceFields,
          },
        },
        normalized: { ...normalized, customer_name: normalized.customer_name },
        model_meta: {
          mode: "real",
          ocr: selectedMethod === "anthropic_multimodal" ? "anthropic_multimodal" : "email_body",
          classifier: "invoice-parser",
          extractor: aiConfig.primaryModel,
          ai_provider: aiConfig.provider,
          ai_model_primary: aiConfig.primaryModel,
          ai_model_fallback: aiConfig.fallbackModel,
          ai_tokens_input: totalInputTokens > 0 ? totalInputTokens : null,
          ai_tokens_output: totalOutputTokens > 0 ? totalOutputTokens : null,
          ai_cost_usd_actual: actualExtractionCostUsd > 0 ? actualExtractionCostUsd : null,
          anthropic_model_primary: aiConfig.primaryModel,
          anthropic_model_fallback: aiConfig.fallbackModel,
          extraction_method_selected: selectedMethod,
          extraction_methods_tried: methodsTried,
          extraction_method_benchmarks: extractionBenchmarks,
          selected_method_benchmark: selectedBenchmark,
          estimated_extraction_cost_index: selectedBenchmark?.estimated_cost_index ?? null,
          estimated_extraction_cost_usd: selectedBenchmark?.estimated_cost_usd ?? null,
          effective_extraction_cost_usd:
            actualExtractionCostUsd > 0
              ? actualExtractionCostUsd
              : (selectedBenchmark?.estimated_cost_usd ?? null),
          prompt_version: aiConfig.promptVersion,
          mime_type: mimeType,
        },
        confidence: normalized.confidence,
        current: true,
      })
      .select("id")
      .single();

    if (extractionError || !extraction) {
      throw extractionError ?? new Error("Extraction insert returned no data");
    }

    // ── 8. Upsert order_draft ─────────────────────────────────────────────
    const subtotal = money(normalized.subtotal);
    const taxTotal = money(normalized.tax_total ?? 0);
    const total = money(normalized.total ?? (subtotal ?? 0) + (taxTotal ?? 0));

    // Cleo-authoritative drafts: HTML parser already populated buyer,
    // addresses, totals and lines. Don't let AI overwrite those — they're
    // structured data, AI extraction is a fallback. We still record the
    // extraction (above) so the user can see what AI found, but the draft
    // itself stays as Cleo wrote it.
    const { data: existingDraft } = await supabase
      .from("order_drafts")
      .select("id, meta")
      .eq("document_id", documentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const existingMeta = (existingDraft?.meta ?? {}) as Record<string, unknown>;
    const cleoAuthoritative = existingMeta.cleo_authoritative === true;

    if (cleoAuthoritative && existingDraft) {
      // Move document forward but don't touch draft fields or lines.
      await supabase
        .from("documents")
        .update({ state: "needs_review", last_error: null })
        .eq("id", documentId)
        .eq("tenant_id", tenantId);
      return json({ ok: true, run_id: runId, draft_id: existingDraft.id, cleo_authoritative: true });
    }

    const { data: draft, error: draftError } = await supabase
      .from("order_drafts")
      .upsert(
        {
          tenant_id: tenantId,
          document_id: documentId,
          extraction_id: extraction.id,
          po_number: normalized.po_number,
          po_date: normalized.po_date,
          delivery_date: normalized.delivery_date ?? null,
          currency: normalized.currency,
          payment_terms: normalized.payment_terms ?? null,
          buyer:
            normalized.customer_name || normalized.customer_address || normalized.customer_contact_person
              ? {
                  name: normalized.customer_name,
                  address: normalized.customer_address,
                  contact_person: normalized.customer_contact_person ?? undefined,
                }
              : {},
          shipping_address: (() => {
            const addr = normalized.delivery_address ?? normalized.customer_address;
            if (
              !addr &&
              !normalized.delivery_name &&
              !normalized.delivery_contact_person &&
              !normalized.delivery_phone &&
              !normalized.delivery_email &&
              !normalized.delivery_street &&
              !normalized.delivery_city
            )
              return {};
            return {
              line1: addr ?? undefined,
              name: normalized.delivery_name ?? undefined,
              contact_person: normalized.delivery_contact_person ?? undefined,
              phone: normalized.delivery_phone ?? undefined,
              email: normalized.delivery_email ?? undefined,
              street: normalized.delivery_street ?? undefined,
              city: normalized.delivery_city ?? undefined,
              state: normalized.delivery_state ?? undefined,
              zip: normalized.delivery_zip ?? undefined,
              country: normalized.delivery_country ?? undefined,
            };
          })(),
          billing_address: (() => {
            // Use ONLY normalized.billing_address as the multi-line fallback.
            // Do NOT fall through to customer_address — the AI often puts just the
            // customer's company name there (e.g. "The Home Depot Inc"), which would
            // then leak into line1/street and corrupt the billing address.
            const addr = normalized.billing_address;
            if (
              !addr &&
              !normalized.billing_name &&
              !normalized.billing_contact_person &&
              !normalized.billing_phone &&
              !normalized.billing_email &&
              !normalized.billing_street &&
              !normalized.billing_city
            )
              return {};
            return {
              line1: addr ?? undefined,
              name: normalized.billing_name ?? undefined,
              contact_person: normalized.billing_contact_person ?? undefined,
              phone: normalized.billing_phone ?? undefined,
              email: normalized.billing_email ?? undefined,
              street: normalized.billing_street ?? undefined,
              city: normalized.billing_city ?? undefined,
              state: normalized.billing_state ?? undefined,
              zip: normalized.billing_zip ?? undefined,
              country: normalized.billing_country ?? undefined,
            };
          })(),
          notes: normalized.notes,
          subtotal,
          tax_total: taxTotal,
          total,
          sync_state: "none",
          last_sync_error: null,
          provider_id: autoTemplate.providerId ?? null,
          document_kind: documentKind,
          review_profile_id: reviewProfileId,
          meta: {
            mode: "real",
            confidence: normalized.confidence,
            document_kind: documentKind,
            review_profile: {
              id: reviewProfileId,
              slug: reviewProfile.reviewProfileSlug,
            },
            auto_template: {
              detection_status: autoTemplate.detectionStatus,
              provider_resolved: autoTemplate.detectionStatus === "resolved",
              mapped_count: autoTemplate.mappedCount,
              unmapped_source_count: autoTemplate.unmappedSourceFields.length,
            },
          },
        },
        { onConflict: "document_id" },
      )
      .select("id")
      .single();

    if (draftError || !draft) {
      throw new Error(
        draftError
          ? `order_drafts upsert failed: ${draftError.message} (code=${draftError.code}, details=${draftError.details})`
          : "Order draft upsert returned no data",
      );
    }

    // ── 9. Replace line items ─────────────────────────────────────────────
    // Delete existing lines for this draft, then insert fresh from extraction
    await supabase
      .from("order_draft_lines")
      .delete()
      .eq("order_draft_id", draft.id)
      .eq("tenant_id", tenantId);

    if (normalized.line_items.length > 0) {
      const lineRows = normalized.line_items.map((l) => {
        // When the SKU matches an entry in odoo_products by default_code,
        // resolve the Odoo product directly: set odoo_product_id and use the
        // catalog name as description if AI didn't return one. Works for all
        // sources — Cleo / AI / manual upload — without per-provider mappings.
        const codeKey = (l.sku ?? "").trim().toUpperCase();
        const odooMatch = codeKey ? productByCode?.get(codeKey) : undefined;
        return {
          tenant_id: tenantId,
          order_draft_id: draft.id,
          position: l.position,
          sku: l.sku,
          customer_sku: l.customer_sku ?? null,
          description:
            l.description && l.description.trim().length > 0
              ? l.description
              : (odooMatch?.name ?? l.description),
          quantity: l.quantity,
          unit: l.unit,
          unit_price: money(l.unit_price),
          line_total: money(l.line_total),
          tax_rate: money(l.tax_rate),
          odoo_product_id: odooMatch?.id ?? null,
          kind: l.kind ?? "item",
        };
      });

      const { error: linesError } = await supabase.from("order_draft_lines").insert(lineRows);
      if (linesError) throw new Error(`order_draft_lines insert failed: ${linesError.message} (code=${linesError.code}) rows=${JSON.stringify(lineRows.map(r => ({ sku: r.sku, position: r.position })))}`);
    }

    // ── 10. Debit credits ─────────────────────────────────────────────────
    // Billing: 1 credit per document (provisional)
    await supabase.from("credit_ledger").insert({
      tenant_id: tenantId,
      kind: "debit",
      amount: -1,
      note: `AI processing: ${document.original_name} (run ${runId.slice(0, 8)})`,
      document_id: documentId,
    });

    // ── 11. Move document to needs_review ─────────────────────────────────
    await supabase
      .from("documents")
      .update({ state: "needs_review", last_error: null })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    // ── 11b. QR mobile auto-push (bypass) ─────────────────────────────────
    // Documents uploaded via /api/scan/[token]/upload carry meta.source =
    // "qr-scanner". For these the user wants an unconditional push to Odoo:
    // skip the soft validations (buyer/provider/required fields), keep only
    // hard gates (Odoo conn active, ≥1 line, no duplicate PO). On failure
    // the draft stays as sync_failed and shows up in the manual queue.
    const docMeta =
      (document.meta && typeof document.meta === "object" && !Array.isArray(document.meta)
        ? (document.meta as Record<string, unknown>)
        : null);
    const isQrUpload =
      docMeta?.source === "qr-scanner" || document.source_channel === "qr-scanner";

    if (isQrUpload) {
      const emitQrEvent = (
        outcome: "ok" | "skip" | "fail",
        reason: string,
        extra?: Record<string, unknown>,
      ) =>
        emitWorkflowEvent({
          tenantId,
          documentId,
          runId,
          stage: "qr_auto_push",
          outcome,
          meta: { reason, draft_id: draft.id, ...(extra ?? {}) },
        });

      try {
        // Hard gate 1: ≥1 line (already inserted above; check normalized)
        if (normalized.line_items.length < 1) {
          await supabase
            .from("order_drafts")
            .update({ sync_state: "sync_failed", last_sync_error: "qr_bypass: no lines extracted" })
            .eq("id", draft.id)
            .eq("tenant_id", tenantId);
          await emitQrEvent("fail", "no_lines");
        } else {
          // Hard gate 2: active Odoo connection
          const { data: odooConn } = await supabase
            .from("odoo_connections")
            .select("status")
            .eq("tenant_id", tenantId)
            .maybeSingle();
          const odooOk = (odooConn as { status?: string } | null)?.status === "active";

          if (!odooOk) {
            await supabase
              .from("order_drafts")
              .update({ sync_state: "sync_failed", last_sync_error: "qr_bypass: odoo connection inactive" })
              .eq("id", draft.id)
              .eq("tenant_id", tenantId);
            await emitQrEvent("fail", "odoo_inactive");
          } else {
            // Hard gate 3: duplicate PO check (cross-draft)
            let dupBlock = false;
            if (normalized.po_number) {
              type DupeRow = { id: string; sync_state: string; odoo_so_name: string | null };
              const { data: dupesRaw } = await supabase
                .from("order_drafts")
                .select("id, sync_state, odoo_so_name")
                .eq("tenant_id", tenantId)
                .eq("po_number", normalized.po_number)
                .in("sync_state", ["pending", "in_progress", "synced"])
                .returns<DupeRow[]>();
              const dupes = (dupesRaw ?? []).filter((r) => r.id !== draft.id);
              if (dupes.length > 0) {
                const existing = dupes[0];
                const msg = `qr_bypass: duplicate PO ${normalized.po_number} (existing ${existing.odoo_so_name ?? existing.id})`;
                await supabase
                  .from("order_drafts")
                  .update({ sync_state: "sync_failed", last_sync_error: msg })
                  .eq("id", draft.id)
                  .eq("tenant_id", tenantId);
                await emitQrEvent("fail", "duplicate_po", { existing_id: existing.id });
                dupBlock = true;
              }
            }

            if (!dupBlock) {
              // Mark approved + flip to pending using race-safe guard
              const approvedAt = new Date().toISOString();
              const draftFlip = await supabase
                .from("order_drafts")
                .update({
                  sync_state: "pending",
                  approved_at: approvedAt,
                  approved_by: document.uploaded_by ?? null,
                  last_sync_error: null,
                  meta: {
                    ...(existingMeta ?? {}),
                    bypass: true,
                    bypassed_at: approvedAt,
                    bypass_source: "auto_qr",
                  },
                })
                .eq("id", draft.id)
                .eq("tenant_id", tenantId)
                .not("sync_state", "in", "(pending,in_progress,synced)")
                .select("id");

              if ((draftFlip.data?.length ?? 0) === 0) {
                await emitQrEvent("skip", "already_in_active_sync");
              } else {
                await supabase
                  .from("documents")
                  .update({ state: "reviewed", last_error: null })
                  .eq("id", documentId)
                  .eq("tenant_id", tenantId);

                // Fire odoo-sync with bypass flag — await with timeout but
                // never throw: if it fails the edge updates sync_failed itself.
                const ctl = new AbortController();
                const tId = setTimeout(() => ctl.abort(), 55_000);
                try {
                  const syncRes = await fetch(`${secrets.supabaseUrl}/functions/v1/odoo-sync`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${secrets.supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                      order_draft_id: draft.id,
                      tenant_id: tenantId,
                      run_id: runId,
                      bypass: true,
                    }),
                    signal: ctl.signal,
                  });
                  if (!syncRes.ok) {
                    const body = await syncRes.text();
                    await emitQrEvent("fail", "odoo_sync_http_error", {
                      status: syncRes.status,
                      body: body.slice(0, 500),
                    });
                  } else {
                    await emitQrEvent("ok", "pushed_to_odoo");
                  }
                } catch (e) {
                  await emitQrEvent("fail", "odoo_sync_network_error", {
                    error: e instanceof Error ? e.message : String(e),
                  });
                } finally {
                  clearTimeout(tId);
                }
              }
            }
          }
        }
      } catch (qrErr) {
        await emitQrEvent("fail", "exception", {
          error: qrErr instanceof Error ? qrErr.message : String(qrErr),
        });
      }

      // QR docs do NOT fall through to auto_approve_clean — bypass is exclusive.
      const durationMs = Math.round(performance.now() - startedAt);
      await emitWorkflowEvent({
        tenantId,
        documentId,
        runId,
        stage: "ai_process_complete",
        outcome: "ok",
        durationMs,
        meta: {
          page_count: pageCount,
          line_count: normalized.line_items.length,
          confidence: normalized.confidence,
          qr_bypass: true,
        },
      });
      return json({
        ok: true,
        document_id: documentId,
        draft_id: draft.id,
        line_count: normalized.line_items.length,
        qr_bypass: true,
        duration_ms: durationMs,
      });
    }

    // ── 12. Auto-approve if tenant has auto_approve_clean = true ───────────
    // Emite un workflow_event con outcome+meta para poder depurar por qué
    // un doc se queda (o no) en needs_review.
    const emitAutoApproveEvent = (
      outcome: "ok" | "skip" | "off" | "fail",
      reason: string,
      extra?: Record<string, unknown>,
    ) =>
      emitWorkflowEvent({
        tenantId,
        documentId,
        runId,
        stage: "auto_approve",
        outcome,
        meta: { reason, draft_id: draft.id, ...(extra ?? {}) },
      });

    try {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("auto_approve_clean")
        .eq("id", tenantId)
        .single();

      const autoApproveClean = (tenantRow as Record<string, unknown> | null)?.auto_approve_clean === true;

      if (!autoApproveClean) {
        await emitAutoApproveEvent("off", "tenant.auto_approve_clean is false");
      } else if (autoTemplate.detectionStatus !== "resolved") {
        // Gate 1: template + partner must be resolved
        await emitAutoApproveEvent("skip", "template_not_resolved", {
          provider_id: autoTemplate.providerId ?? null,
        });
      } else {
        // Gate 2: reseller mapping must exist
        const provId = autoTemplate.providerId ?? document.provider_id ?? null;
        let resellerOk = false;
        if (provId) {
          const { data: mapping } = await supabase
            .from("provider_reseller_mappings")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("provider_id", provId)
            .maybeSingle();
          resellerOk = !!mapping;
        }

        if (!resellerOk) {
          await emitAutoApproveEvent("skip", "no_reseller_mapping", { provider_id: provId });
        } else {
          // Cargar required target_fields del tenant (filtrados por review_profile si existe)
          let targetFieldsQuery = supabase
            .from("target_fields")
            .select("key, label, scope, required")
            .eq("tenant_id", tenantId)
            .eq("active", true)
            .eq("required", true);
          if (reviewProfileId) {
            targetFieldsQuery = targetFieldsQuery.eq("review_profile_id", reviewProfileId);
          }
          const { data: requiredFields } = await targetFieldsQuery;
          const targetFields = requiredFields ?? [];

          // Gate 3: required header fields present in normalized output
          const requiredHeaderFields = (targetFields ?? []).filter(
            (f: { required: boolean; scope: string }) => f.required && f.scope !== "line"
          ) as Array<{ key: string; label: string }>;

          const missingHeader = requiredHeaderFields.filter((f) => {
            if (f.key === "partner_id")       return !normalized.customer_name?.trim();
            if (f.key === "client_order_ref") return !normalized.po_number?.trim();
            if (f.key === "date_order")       return !normalized.po_date?.trim();
            if (f.key === "currency_id")      return !normalized.currency?.trim();
            return false;
          });

          // Gate 4: required line fields present across all line items
          const requiredLineFields = (targetFields ?? []).filter(
            (f: { required: boolean; scope: string }) => f.required && f.scope === "line"
          ) as Array<{ key: string }>;

          const failingLineKeys: string[] = [];
          const linesOk = normalized.line_items.length > 0 &&
            requiredLineFields.every((f) => {
              const ok = normalized.line_items.every((line: Record<string, unknown>) => {
                if (f.key === "name")            return Boolean(String(line.description ?? "").trim());
                if (f.key === "product_uom_qty") return Number(line.quantity ?? 0) > 0;
                if (f.key === "price_unit")      return line.unit_price !== null && line.unit_price !== undefined;
                return true; // unknown line field — don't block
              });
              if (!ok) failingLineKeys.push(f.key);
              return ok;
            });

          if (missingHeader.length > 0) {
            await emitAutoApproveEvent("skip", "missing_header_fields", {
              missing: missingHeader.map((f) => f.key),
            });
          } else if (!linesOk) {
            await emitAutoApproveEvent("skip", "incomplete_line_fields", {
              failing_line_keys: failingLineKeys,
              line_count: normalized.line_items.length,
            });
          } else {
            // All gates passed → approve directly via service client
            const now = new Date().toISOString();
            const [docRes, draftRes] = await Promise.all([
              supabase.from("documents")
                .update({ state: "reviewed" })
                .eq("id", documentId)
                .eq("tenant_id", tenantId)
                .select("id"),
              supabase.from("order_drafts")
                .update({ sync_state: "pending", approved_at: now })
                .eq("id", draft.id)
                .eq("tenant_id", tenantId)
                .select("id"),
            ]);

            if ((docRes.data?.length ?? 0) === 0 || (draftRes.data?.length ?? 0) === 0) {
              await emitAutoApproveEvent("fail", "rls_blocked_update", {
                doc_updated: docRes.data?.length ?? 0,
                draft_updated: draftRes.data?.length ?? 0,
                doc_error: docRes.error?.message ?? null,
                draft_error: draftRes.error?.message ?? null,
              });
            } else {
              // Trigger Odoo sync — await with timeout so the Edge Function doesn't
              // exit before the request actually goes out (fire-and-forget gets killed
              // by the Deno isolate runtime).
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 60_000);
              try {
                const syncRes = await fetch(`${secrets.supabaseUrl}/functions/v1/odoo-sync`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${secrets.supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ order_draft_id: draft.id, tenant_id: tenantId }),
                  signal: controller.signal,
                });
                if (!syncRes.ok) {
                  const body = await syncRes.text();
                  await emitAutoApproveEvent("fail", "odoo_sync_http_error", {
                    status: syncRes.status,
                    body: body.slice(0, 500),
                  });
                } else {
                  await emitAutoApproveEvent("ok", "approved_and_synced");
                }
              } catch (syncErr) {
                await emitAutoApproveEvent("fail", "odoo_sync_network_error", {
                  error: syncErr instanceof Error ? syncErr.message : String(syncErr),
                });
              } finally {
                clearTimeout(timeoutId);
              }
            }
          }
        }
      }
    } catch (autoApproveErr) {
      // Non-fatal — doc stays in needs_review, human can approve manually
      await emitAutoApproveEvent("fail", "exception", {
        error: autoApproveErr instanceof Error ? autoApproveErr.message : String(autoApproveErr),
      });
    }

    const durationMs = Math.round(performance.now() - startedAt);

    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ai_process_complete",
      outcome: "ok",
      durationMs,
      meta: {
        page_count: pageCount,
        line_count: normalized.line_items.length,
        confidence: normalized.confidence,
      },
    });

    return json({
      ok: true,
      document_id: documentId,
      draft_id: draft.id,
      line_count: normalized.line_items.length,
      confidence: normalized.confidence,
      duration_ms: durationMs,
    });
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Clasifica errores transitorios del proveedor de IA para mostrar mensaje útil al usuario.
    const isAiProviderError =
      /\b(529|503|502|504)\b/.test(errorMessage) ||
      /overloaded|rate[_ ]?limit|service[_ ]?unavailable/i.test(errorMessage) ||
      errorMessage.includes("All extraction methods failed");
    const friendlyError = isAiProviderError
      ? `ai_provider_unavailable: el proveedor de IA (Anthropic) está sobrecargado o no responde. Intenta reprocesar en unos minutos. (${errorMessage.slice(0, 200)})`
      : errorMessage.slice(0, 500);

    await supabase
      .from("documents")
      .update({
        state: "failed_processing",
        last_error: friendlyError.slice(0, 500),
      })
      .eq("id", documentId)
      .eq("tenant_id", tenantId);

    await emitWorkflowEvent({
      tenantId,
      documentId,
      runId,
      stage: "ai_process_failed",
      outcome: "fail",
      durationMs,
      errorCode: "pipeline_error",
      meta: { error: errorMessage.slice(0, 300) },
    });

    console.error(`[ai-process] ${documentId} failed:`, err);
    return json({ error: "AI processing failed", detail: errorMessage }, 500);
  } finally {
    // Defense in depth: if the function returns normally above, this is a no-op.
    // If the Deno worker is killed (CPU timeout, OOM) AFTER the catch had a
    // chance to write `failed_processing`, this still runs. If the worker is
    // killed BEFORE either path executes, the janitor (PROCESSING_TIMEOUT_MS)
    // is the last line of defense — but at least we never leave a doc stuck
    // in `processing` when the handler completes by any return path.
    try {
      const { data: doc } = await supabase
        .from("documents")
        .select("state")
        .eq("id", documentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (doc?.state === "processing") {
        await supabase
          .from("documents")
          .update({
            state: "failed_processing",
            last_error: "ai_process: handler exited without resolving state",
          })
          .eq("id", documentId)
          .eq("tenant_id", tenantId);
        console.warn(
          `[ai-process] ${documentId} finally-block rescued doc stuck in processing`,
        );
      }
    } catch (finalErr) {
      console.error("[ai-process] finally-block rescue failed:", finalErr);
    }
  }
});
