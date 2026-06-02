"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ERP_BASE_URL } from "@/lib/erp-url";
import { StatusBadge, type BadgeVariant } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useDocumentPresence } from "@/hooks/use-document-presence";
import { useLocale, useTranslations } from "next-intl";
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  CheckCircle2,
  Braces,
  Globe,
  Copy,
  Check,
  X,
  Printer,
  Download,
  AlertCircle,
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  FileText,
  Keyboard,
  Package,
  Info,
  LayoutList,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Lock,
  Minus,
  NotebookText,
  PanelRight,
  Plus,
  Receipt,
  ReceiptText,
  RotateCcw,
  RotateCw,
  Rows3,
  Columns3,
  RefreshCw,
  ScanEye,
  Search,
  Sparkles,
  Tag,
  TriangleAlert,
  Trash2,
  PackageCheck,
  PackageSearch,
  Truck,
  WandSparkles,
} from "lucide-react";
import { ApproveButton } from "./approve-button";
import { PushButton } from "./push-button";
import { PdfReviewViewer, type PdfOverlayHighlight } from "./pdf-review-viewer";
import { ExcelViewer } from "@/components/app/excel-viewer";
import { KeyboardHelpOverlay } from "@/components/app/keyboard-help-overlay";
import { RejectButton } from "./reject-button";
import { PagesRail } from "./pages-rail";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useSidebar } from "@/components/ui/sidebar";
import { ZoomPopover } from "./zoom-popover";

// ── HtmlDocViewer ──────────────────────────────────────────────────────────
// Renderiza documentos text/html haciendo fetch del contenido y escribiéndolo
// directamente al iframe via doc.write(). Evita el problema de que Supabase
// Storage devuelva el archivo con Content-Type: text/plain.
function HtmlDocViewer({ url }: { url: string }) {
  const t = useTranslations("review");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((html) => {
        if (!active) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument;
        if (!doc) return;
        const wrapped = html.includes("<html") ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;font-size:13px}img{max-width:100%}</style></head><body>${html}</body></html>`;
        doc.open();
        doc.write(wrapped);
        doc.close();
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  return (
    <div className="relative h-full w-full bg-white">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="text-sm text-slate-400">{t("toolbar.loading")}</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="html-document"
        sandbox="allow-same-origin"
        className="h-full w-full border-0"
      />
    </div>
  );
}

type DraftSnapshot = {
  id: string;
  po_number: string | null;
  po_date: string | null;
  delivery_date: string | null;
  currency: string | null;
  payment_terms: string | null;
  customer_name: string;
  customer_contact_person: string;
  customer_address: string;
  delivery_address: unknown; // raw JSONB from DB
  billing_address: unknown; // raw JSONB from DB
  notes: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  sync_state: string;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
  mock: boolean;
};

type LineKind = "item" | "discount" | "freight" | "surcharge" | "adjustment";

type LineSnapshot = {
  id: string;
  position: number;
  sku: string | null;
  customer_sku: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  tax_rate: number | null;
  odoo_product_id: number | null;
  kind?: LineKind | null;
};

type EditableLine = {
  id: string | null;
  clientId: string;
  sku: string;
  customer_sku: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  tax_rate: string;
  odoo_product_id: number | null;
  kind: LineKind;
};

type AddressFields = {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

const EMPTY_ADDRESS: AddressFields = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  country: "",
};

const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
]);

function inferCountry(state: string, zip: string): string {
  if (US_STATES.has(state.toUpperCase()) && /^\d{5}/.test(zip)) return "United States";
  return "";
}

// Matches trailing country names / ISO codes at the end of a comma-separated address.
const TRAILING_COUNTRY_RE =
  /^(united states(?: of america)?|u\.s\.a?\.?|usa|canada|mexico|uk|united kingdom|great britain|gb|australia|au|germany|de|france|fr|spain|es|japan|jp|china|cn|brazil|br|india|in|us)$/i;

function parseAddressString(raw: string): AddressFields {
  const trimmed = raw.trim();
  if (!trimmed) return { ...EMPTY_ADDRESS };

  const byLine = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const segs =
    byLine.length >= 2
      ? byLine
      : trimmed
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);

  if (segs.length === 1)
    return { ...EMPTY_ADDRESS, street: segs[0], country: inferCountry("", segs[0]) };

  let name = "";
  let city = "";
  let state = "";
  let zip = "";
  let country = "";
  let rest = [...segs];

  // ── Step 1: strip trailing country segment first ──────────────────────────
  // e.g. "...United States" | "...US" | "...Canada"
  if (rest.length > 1 && TRAILING_COUNTRY_RE.test(rest[rest.length - 1])) {
    country = rest[rest.length - 1];
    rest = rest.slice(0, -1);
  }

  // ── Step 2: extract State+ZIP (and optionally City) from the new last seg ─
  // Patterns: "IL 62238" | "Knoxville, TN 37922" | "TN 37922 USA"
  const stateZip = /^([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;
  const cityStateZip = /^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;
  const last = rest[rest.length - 1];
  const csz = last.match(cityStateZip);
  const sz = !csz ? last.match(stateZip) : null;

  if (csz) {
    city = csz[1].trim();
    state = csz[2].toUpperCase();
    zip = csz[3];
    if (!country) country = csz[4]?.trim() ?? "";
    rest = rest.slice(0, -1);
  } else if (sz) {
    state = sz[1].toUpperCase();
    zip = sz[2];
    if (!country) country = sz[3]?.trim() ?? "";
    rest = rest.slice(0, -1);
    // Previous segment is city if it has no digits and is not a country name
    if (rest.length > 0) {
      const maybeCity = rest[rest.length - 1];
      if (!/\d/.test(maybeCity) && !TRAILING_COUNTRY_RE.test(maybeCity)) {
        city = maybeCity;
        rest = rest.slice(0, -1);
      }
    }
  }

  // ── Step 3: first remaining no-digit segment is recipient name ────────────
  if (rest.length >= 2 && !/\d/.test(rest[0])) {
    name = rest[0];
    rest = rest.slice(1);
  }

  const resolvedCountry = country || inferCountry(state, zip);
  return {
    name,
    contact_person: "",
    email: "",
    phone: "",
    street: rest.join(", "),
    city,
    state,
    zip,
    country: resolvedCountry,
  };
}

// Initializes AddressFields directly from raw JSONB (skips string round-trip).
// Handles both old { line1: "..." } format and new { name, street, city, state, zip, country }.
function initAddressFields(raw: unknown): AddressFields {
  if (typeof raw === "string") return parseAddressString(raw);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_ADDRESS };

  const r = raw as Record<string, unknown>;
  const s = (keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const name = s(["name", "recipient", "contact_name"]);
  const contactPerson = s(["contact_person", "additional_name", "attention", "attn"]);
  const email = s(["email", "mail"]);
  const phone = s(["phone", "mobile", "tel"]);
  const street = s(["street", "line1", "address", "address1"]);
  const city = s(["city", "town"]);
  const state = s(["state", "province", "region"]);
  const zip = s(["zip", "postal_code", "postcode"]);
  const country = s(["country", "country_name"]);

  // If no structured city/state/zip, parse the flat address string and merge
  // explicit name/phone/email on top (works for both old and new AI format).
  if (!city && !state && !zip && street) {
    const parsed = parseAddressString(street);
    return {
      name: name || parsed.name,
      contact_person: contactPerson,
      email: email || parsed.email,
      phone: phone || parsed.phone,
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      country: parsed.country || country || inferCountry(parsed.state, parsed.zip),
    };
  }

  const resolvedCountry = country || inferCountry(state, zip);
  return { name, contact_person: contactPerson, email, phone, street, city, state, zip, country: resolvedCountry };
}

function addressHasContent(addr: AddressFields) {
  return !!(addr.name || addr.contact_person || addr.street || addr.city || addr.state || addr.zip);
}

type SaveReviewOverrides = Partial<{
  poNumber: string;
  poDate: string;
  deliveryDate: string;
  currency: string;
  paymentTerms: string;
  customer: string;
  customerContactPerson: string;
  customerAddress: string;
  deliveryAddress: AddressFields;
  billingAddress: AddressFields;
  notes: string;
  lines: EditableLine[];
}>;

type TargetFieldSnapshot = {
  id: string;
  key: string;
  label: string;
  scope: string;
  required: boolean;
};

type DetectedFieldSnapshot = {
  rects?: Array<{
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number | null;
    provenance: "document_ai" | "pdf_text" | "anchor" | "manual";
  }>;
  provenance?: "document_ai" | "pdf_text" | "anchor" | "manual" | null;
  key: string;
  label: string;
  value: string;
  page: number;
  confidence: number | null;
  category: string;
  source: string;
};

export type DocumentKind = "sale_order";

type ReviewLayoutSectionId = "header" | "shipping" | "lines" | "notes";

type ReviewLayoutSection = {
  id: ReviewLayoutSectionId;
  label: string;
  enabled: boolean;
  order: number;
};

type ReviewLayoutConfig = {
  default_section: ReviewLayoutSectionId;
  sections: ReviewLayoutSection[];
  field_sections: Partial<Record<string, ReviewLayoutSectionId>>;
  field_order: Partial<Record<string, number>>;
};

interface ReviewWorkspaceProps {
  currentUser: { id: string; name?: string; email: string };
  document: {
    id: string;
    docNumber: string | null;
    originalName: string;
    mimeType: string | null;
    state: string;
    pageCount: number | null;
    signedUrl: string | null;
    providerId: string | null;
    reviewProfileId: string | null;
    createdAt?: string | null;
    detectionStatus: "resolved" | "unresolved" | null;
  };
  reviewProfileName?: string | null;
  prevDocId?: string | null;
  nextDocId?: string | null;
  draft: DraftSnapshot;
  lines: LineSnapshot[];
  targetFields: TargetFieldSnapshot[];
  profileLayout: Record<string, unknown> | null;
  extractionPayload: unknown;
  detectedFields: DetectedFieldSnapshot[];
  initialProviderResolution: ProviderResolutionState;
  initialFieldAnnotations: FieldAnnotationSnapshot[];
  odooProducts: OdooProductSnapshot[];
  productMappings: ProductMappingSnapshot[];
  providerSettings: Record<string, unknown>;
  packingSlipDocs?: Array<{ id: string; name: string; sizeBytes: number; signedUrl: string | null }>;
}

type ResellerCandidate = {
  id: number;
  name: string;
};

type ProviderResolutionState = {
  document: {
    resolved: boolean;
    provider_id: string | null;
    review_profile_id: string | null;
  };
  provider: { id: string; name: string; code: string } | null;
  reseller_mapping: { odoo_partner_id: number; odoo_partner_name: string | null } | null;
  candidates: ResellerCandidate[];
};

type FieldAnnotationSnapshot = {
  id: string;
  target_field_key: string;
  source_hint: string | null;
  normalized_text: string | null;
  selection_meta: Record<string, unknown> | null;
  created_at: string;
};

type OdooProductSnapshot = {
  odoo_product_id: number;
  name: string;
  default_code: string | null;
  barcode: string | null;
  uom_name: string | null;
};

type ProductMappingSnapshot = {
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

type SkuRule = {
  type: "strip_prefix" | "strip_suffix" | "strip_separators";
  value?: string;
};

type SkuSuggestionReason = "mapping" | "exact" | "rule" | "inferred" | "description";

type SkuSuggestion = {
  product: OdooProductSnapshot;
  reason: SkuSuggestionReason;
  label: string;
  transformedSku: string;
  rule?: SkuRule;
};

type SaveReviewError = {
  error?: string;
  detail?: string;
};

type StudioGroupId = "header" | "addresses" | "terms" | "totals" | "lines" | "other";

type StudioFieldCandidate = DetectedFieldSnapshot & {
  id: string;
  group: StudioGroupId;
};

type StudioTargetDefinition = {
  key: string;
  section: ReviewLayoutSectionId;
  label: string;
  hint?: string;
};

function toLineState(line: LineSnapshot): EditableLine {
  return {
    id: line.id,
    clientId: line.id,
    sku: line.sku ?? "",
    customer_sku: line.customer_sku ?? "",
    description: line.description,
    quantity: String(line.quantity ?? ""),
    unit: line.unit ?? "",
    unit_price: line.unit_price === null ? "" : String(line.unit_price),
    tax_rate: line.tax_rate === null ? "" : String(line.tax_rate),
    odoo_product_id: line.odoo_product_id ?? null,
    kind: (line.kind as LineKind | undefined) ?? "item",
  };
}

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number | null, currency: string | null, locale: string) {
  if (value === null) return "-";
  if (!currency) return value.toLocaleString(locale);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

function fieldValue(value: string | number | null) {
  return value === null || value === "" ? "-" : String(value);
}

function lineTotal(line: EditableLine) {
  return numeric(line.quantity) * numeric(line.unit_price);
}

function uniqueTerms(values: Array<string | number | null | undefined>) {
  return [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter((value) => value.length >= 2),
    ),
  ];
}

function dateTerms(value: string) {
  if (!value) return [];

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return [value];

  return uniqueTerms([
    value,
    `${month}/${day}/${year}`,
    `${Number(month)}/${Number(day)}/${year}`,
    `${day}/${month}/${year}`,
  ]);
}

function moneyTerms(value: number | null, currency: string, locale: string) {
  if (value === null) return [];

  const fixed = value.toFixed(2);
  const compact = Number.isInteger(value) ? String(value) : String(value);

  return uniqueTerms([
    fixed,
    compact,
    `$${fixed}`,
    `${fixed} ${currency}`,
    formatMoney(value, currency || null, locale),
  ]);
}

function highlightTone(category: string): PdfOverlayHighlight["tone"] {
  switch (category) {
    case "line_item":
      return "rose";
    case "address":
      return "teal";
    case "totals":
      return "amber";
    default:
      return "blue";
  }
}


function studioGroupForCategory(category: string): StudioGroupId {
  switch (category) {
    case "header":
      return "header";
    case "address":
      return "addresses";
    case "terms":
      return "terms";
    case "totals":
      return "totals";
    case "line_item":
      return "lines";
    default:
      return "other";
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSkuCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeSkuLoose(value: string | null | undefined) {
  return normalizeSkuCode(value).replace(/[\s\-_/\\.]+/g, "");
}

function uniqueSkuSuggestions(suggestions: SkuSuggestion[]) {
  const seen = new Set<number>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.product.odoo_product_id)) return false;
    seen.add(suggestion.product.odoo_product_id);
    return true;
  });
}

function parseSkuRules(raw: unknown): SkuRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((rule): rule is SkuRule => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
    const record = rule as Record<string, unknown>;
    return (
      record.type === "strip_prefix" ||
      record.type === "strip_suffix" ||
      record.type === "strip_separators"
    );
  });
}

function looksLikeSkuField(field: DetectedFieldSnapshot) {
  const haystack = `${field.key} ${field.label} ${field.source}`.toLowerCase();
  return haystack.includes("sku") || haystack.includes("part") || haystack.includes("product_id");
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function lineHasValue(line: EditableLine, key: string) {
  switch (key) {
    case "product_id":
      return Number.isFinite(line.odoo_product_id ?? NaN);
    case "product_uom_qty":
      return numeric(line.quantity) > 0;
    case "price_unit":
      return hasText(line.unit_price);
    case "name":
      return hasText(line.description);
    case "tax_id":
      return hasText(line.tax_rate);
    default:
      return true;
  }
}

function joinLabels(labels: string[]) {
  return labels.join(", ");
}


const inputCls =
  "h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[var(--color-fg)] text-xs transition-colors outline-none focus:border-[var(--color-border-hv)] disabled:opacity-50";

function AddressFieldGroup({
  label,
  value,
  disabled,
  onChange,
  onBlur,
  singleContact,
}: {
  label: string;
  value: AddressFields;
  disabled?: boolean;
  onChange: (v: AddressFields) => void;
  onBlur?: () => void;
  singleContact?: boolean;
}) {
  const set = (key: keyof AddressFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...value, [key]: e.target.value };
    // Auto-infer country when state/zip change and country is still empty
    if ((key === "state" || key === "zip") && !value.country) {
      const inferredCountry = inferCountry(
        key === "state" ? e.target.value : value.state,
        key === "zip" ? e.target.value : value.zip,
      );
      if (inferredCountry) next.country = inferredCountry;
    }
    onChange(next);
  };

  // Combined display value: "Company, Person" or whichever is present
  const contactDisplay = [value.name, value.contact_person].filter(Boolean).join(", ");

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-[var(--color-fg)]">{label}</span>
      {singleContact ? (
        <input
          className={inputCls}
          placeholder="Contact (e.g. The Retailer A, Victor Roggia)"
          value={contactDisplay}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, name: e.target.value, contact_person: "" })}
          onBlur={onBlur}
        />
      ) : (
        <>
          <input
            className={inputCls}
            placeholder="Company name"
            value={value.name}
            disabled={disabled}
            onChange={set("name")}
            onBlur={onBlur}
          />
          <input
            className={inputCls}
            placeholder="Contact person"
            value={value.contact_person}
            disabled={disabled}
            onChange={set("contact_person")}
            onBlur={onBlur}
          />
        </>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <input
          className={inputCls}
          placeholder="Email"
          value={value.email}
          disabled={disabled}
          onChange={set("email")}
          onBlur={onBlur}
        />
        <input
          className={inputCls}
          placeholder="Phone"
          value={value.phone}
          disabled={disabled}
          onChange={set("phone")}
          onBlur={onBlur}
        />
      </div>
      <input
        className={inputCls}
        placeholder="Street address"
        value={value.street}
        disabled={disabled}
        onChange={set("street")}
        onBlur={onBlur}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <input
          className={inputCls}
          placeholder="City"
          value={value.city}
          disabled={disabled}
          onChange={set("city")}
          onBlur={onBlur}
        />
        <input
          className={inputCls}
          placeholder="State"
          value={value.state}
          disabled={disabled}
          onChange={set("state")}
          onBlur={onBlur}
        />
        <input
          className={inputCls}
          placeholder="ZIP"
          value={value.zip}
          disabled={disabled}
          onChange={set("zip")}
          onBlur={onBlur}
        />
      </div>
      <input
        className={inputCls}
        placeholder="Country"
        value={value.country}
        disabled={disabled}
        onChange={set("country")}
        onBlur={onBlur}
      />
    </div>
  );
}

// ── JSON Syntax Highlighter ────────────────────────────────────────────────
function syntaxHighlightJson(raw: string): string {
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#0369a1;font-weight:600">${match}</span>`; // key → sky-700
        return `<span style="color:#047857">${match}</span>`; // string → emerald-700
      }
      if (/true|false/.test(match)) return `<span style="color:#6d28d9;font-weight:600">${match}</span>`; // violet-700
      if (/null/.test(match)) return `<span style="color:#be123c;font-weight:600">${match}</span>`; // rose-700
      return `<span style="color:#b45309;font-weight:600">${match}</span>`; // number → amber-700
    },
  );
}

// ── PO HTML Generator ──────────────────────────────────────────────────────
function generatePoHtml(opts: {
  poNumber: string; poDate: string; customer: string; currency: string;
  paymentTerms: string; customerAddress: string;
  deliveryAddress: { name: string; street: string; city: string; state: string; zip: string; country: string };
  lines: Array<{ sku: string; description: string; quantity: string; unit_price: string; unit: string; line_total: number | null }>;
  subtotal: number | null; taxTotal: number | null; total: number | null;
  locale: string; docNumber: string;
}): string {
  const fmt = (n: number | null) => n != null ? n.toLocaleString(opts.locale, { style: "currency", currency: opts.currency || "USD" }) : "—";
  const linesHtml = opts.lines.map((l, i) => `
    <tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 12px;color:#64748b;font-size:12px">${i + 1}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:500">${l.description || "—"}</td>
      <td style="padding:8px 12px;font-size:12px;color:#475569;font-family:monospace">${l.sku || "—"}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right">${l.quantity}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right">${l.unit || "—"}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right">${l.unit_price ? Number(l.unit_price).toLocaleString(opts.locale, { style: "currency", currency: opts.currency || "USD" }) : "—"}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;text-align:right">${fmt(l.line_total)}</td>
    </tr>`).join("");
  const da = opts.deliveryAddress;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Purchase Order ${opts.poNumber}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#1e293b;padding:32px;min-height:100vh}
    @media print{body{background:white;padding:16px}@page{margin:1.5cm}}
  </style></head>
  <body>
    <div style="max-width:860px;margin:0 auto;background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="color:#7dd3fc;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">Purchase Order</div>
          <div style="color:white;font-size:28px;font-weight:800;letter-spacing:-0.5px">${opts.poNumber || "—"}</div>
          <div style="color:#94a3b8;font-size:12px;margin-top:4px;font-family:monospace">#${opts.docNumber}</div>
        </div>
        <div style="text-align:right">
          <div style="color:#94a3b8;font-size:11px;margin-bottom:4px">Date</div>
          <div style="color:white;font-size:14px;font-weight:600">${opts.poDate || "—"}</div>
          <div style="margin-top:8px;background:rgba(34,197,94,0.2);color:#4ade80;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block">ACTIVE</div>
        </div>
      </div>
      <!-- Meta strip -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid #f1f5f9">
        <div style="padding:16px 24px;border-right:1px solid #f1f5f9">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Customer</div>
          <div style="font-size:13px;font-weight:600;color:#1e293b">${opts.customer || "—"}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${opts.customerAddress || ""}</div>
        </div>
        <div style="padding:16px 24px;border-right:1px solid #f1f5f9">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Ship To</div>
          <div style="font-size:13px;font-weight:600;color:#1e293b">${da.name || opts.customer}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;line-height:1.5">${[da.street, `${da.city}${da.state ? ", " + da.state : ""} ${da.zip}`, da.country].filter(Boolean).join("<br>")}</div>
        </div>
        <div style="padding:16px 24px">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Payment</div>
          <div style="font-size:13px;font-weight:600;color:#1e293b">${opts.paymentTerms || "—"}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${opts.currency}</div>
        </div>
      </div>
      <!-- Lines table -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">#</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">Description</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">SKU</th>
              <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">Qty</th>
              <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">UoM</th>
              <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">Unit Price</th>
              <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;border-bottom:2px solid #e2e8f0">Total</th>
            </tr>
          </thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </div>
      <!-- Totals -->
      <div style="display:flex;justify-content:flex-end;padding:20px 36px;border-top:1px solid #f1f5f9">
        <div style="width:260px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#64748b">
            <span>Subtotal</span><span style="font-family:monospace">${fmt(opts.subtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9">
            <span>Tax</span><span style="font-family:monospace">${fmt(opts.taxTotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:12px 0 0;font-size:16px;font-weight:800;color:#0f172a">
            <span>Total</span><span style="font-family:monospace">${fmt(opts.total)}</span>
          </div>
        </div>
      </div>
      <div style="padding:16px 36px 24px;text-align:center;font-size:11px;color:#cbd5e1">Generated by DocFlow · DocFlow</div>
    </div>
  </body></html>`;
}

export function ReviewWorkspace({
  currentUser,
  document,
  draft: initialDraft,
  lines: initialLines,
  targetFields,
  profileLayout,
  extractionPayload,
  detectedFields,
  initialProviderResolution,
  initialFieldAnnotations,
  odooProducts,
  productMappings: initialProductMappings,
  providerSettings,
  packingSlipDocs = [],
  reviewProfileName = null,
  prevDocId = null,
  nextDocId = null,
}: ReviewWorkspaceProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("review");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [poNumber, setPoNumber] = useState(initialDraft.po_number ?? "");
  const [poDate, setPoDate] = useState(initialDraft.po_date ?? "");
  const [deliveryDate, setDeliveryDate] = useState(initialDraft.delivery_date ?? "");
  const [currency, setCurrency] = useState(initialDraft.currency ?? "");
  const [customer, setCustomer] = useState(initialDraft.customer_name ?? "");
  const [customerContactPerson, setCustomerContactPerson] = useState(
    initialDraft.customer_contact_person ?? "",
  );
  const [customerAddress, setCustomerAddress] = useState(initialDraft.customer_address ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState<AddressFields>(() =>
    initAddressFields(initialDraft.delivery_address),
  );
  const [billingAddress, setBillingAddress] = useState<AddressFields>(() =>
    initAddressFields(initialDraft.billing_address),
  );
  const [paymentTerms, setPaymentTerms] = useState(initialDraft.payment_terms ?? "");
  const [notes, setNotes] = useState(initialDraft.notes ?? "");
  const [lines, setLines] = useState(() => initialLines.map(toLineState));
  const [savedTotals, setSavedTotals] = useState({
    subtotal: initialDraft.subtotal,
    taxTotal: initialDraft.tax_total,
    total: initialDraft.total,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const isEditable = document.state === "needs_review";
  const [mobileTab, setMobileTab] = useState<"pdf" | "edit">("edit");
  const [openLine, setOpenLine] = useState(() => initialLines[0]?.id ?? "");
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);
  const [studioDrawerOpen, setStudioDrawerOpen] = useState(false);
  const [htmlDrawerOpen, setHtmlDrawerOpen] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [reanalyzeConfirmOpen, setReanalyzeConfirmOpen] = useState(false);
  const [, setActiveTab] = useState<ReviewLayoutSectionId>("header");
  // When a save is in-flight and a new save is requested, we queue a re-save.
  // This prevents edits made during addLine/save from being silently dropped.
  const resaveNeededRef = useRef(false);

  // Collapse global app sidebar ONLY on initial mount (so user can re-open it via the header trigger)
  const { setOpen: setAppSidebarOpen } = useSidebar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAppSidebarOpen(false); }, []);
  const [viewerCurrentPage, setViewerCurrentPage] = useState(1);
  const [viewerTotalPages, setViewerTotalPages] = useState(document.pageCount ?? 1);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerZoomMode, setViewerZoomMode] = useState<"fit" | "manual">("fit");
  const [viewerRotation, setViewerRotation] = useState<0 | 90 | 180 | 270>(0);
  const [pageFlow, setPageFlow] = useState<"vertical" | "horizontal">("vertical");
  const [pagesRailOpen, setPagesRailOpen] = useState((document.pageCount ?? 1) > 1);

  // Auto-open pages rail once the PDF reveals its true page count (DB value may be stale)
  const handleTotalPagesChange = useCallback((n: number) => {
    setViewerTotalPages(n);
    if (n > 1) setPagesRailOpen((prev) => {
      // Only auto-open on first reveal, not on user-driven collapse
      if (prev === false && (document.pageCount ?? 1) <= 1) return true;
      return prev;
    });
  }, [document.pageCount]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [providerResolution, setProviderResolution] = useState<ProviderResolutionState | null>(
    initialProviderResolution,
  );
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [resolutionSaving, setResolutionSaving] = useState(false);
  const [resellerQuery, setResellerQuery] = useState("");
  const [selectedResellerId, setSelectedResellerId] = useState<number | null>(
    initialProviderResolution.reseller_mapping?.odoo_partner_id ?? null,
  );
  const [resellerDialogOpen, setResellerDialogOpen] = useState(false);
  const [routingBannerDismissed, setRoutingBannerDismissed] = useState(false);
  const [fieldAnnotations, setFieldAnnotations] = useState(initialFieldAnnotations);
  const [selectedStudioTarget, setSelectedStudioTarget] = useState<StudioTargetDefinition | null>(
    null,
  );
  const [pendingStudioField, setPendingStudioField] = useState<StudioFieldCandidate | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [savingStudioMapping, setSavingStudioMapping] = useState(false);
  const [productMappings, setProductMappings] = useState(initialProductMappings);
  // Quick SKU status dialog (new simple UX)
  const [skuQuickDialog, setSkuQuickDialog] = useState<{
    lineId: string;
    sku: string;
    description: string;
  } | null>(null);
  const [skuQuickSearch, setSkuQuickSearch] = useState("");

  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [skuModalSource, setSkuModalSource] = useState<{
    sku: string;
    description: string;
    lineId?: string | null;
  } | null>(null);
  const [skuProductQuery, setSkuProductQuery] = useState("");
  const [selectedSkuProductId, setSelectedSkuProductId] = useState<number | null>(null);
  const [selectedSkuRule, setSelectedSkuRule] = useState<SkuRule | null>(null);
  const [savingSkuMapping, setSavingSkuMapping] = useState(false);
  const {
    others: presenceUsers,
    initials: presenceInitials,
    colorForUserId,
  } = useDocumentPresence(document.id, currentUser);

  const detectedResolved = useMemo(() => {
    if (providerResolution?.document?.resolved) return true;
    if (
      document.detectionStatus === "resolved" &&
      document.providerId &&
      document.reviewProfileId
    ) {
      return true;
    }
    return false;
  }, [
    document.detectionStatus,
    document.providerId,
    document.reviewProfileId,
    providerResolution?.document?.resolved,
  ]);

  const refreshProviderResolution = useCallback(
    async (query = "", options?: { syncSelection?: boolean }) => {
      setResolutionLoading(true);
      try {
        const search = query.trim();
        const response = await fetch(
          `/api/review/documents/${document.id}/provider-resolution${search ? `?q=${encodeURIComponent(search)}` : ""}`,
        );
        if (!response.ok) throw new Error("resolution_fetch_failed");

        const payload = (await response.json()) as ProviderResolutionState;
        setProviderResolution(payload);
        if (options?.syncSelection) {
          setSelectedResellerId(payload.reseller_mapping?.odoo_partner_id ?? null);
        }
      } catch {
        toast.error(t("toasts.providerResolutionLoadFailed"));
      } finally {
        setResolutionLoading(false);
      }
    },
    [document.id, t],
  );

  useEffect(() => {
    if (!resellerDialogOpen) return;
    const search = resellerQuery.trim();

    if (search.length < 2) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshProviderResolution(search);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [refreshProviderResolution, resellerDialogOpen, resellerQuery]);

  const studioMode = studioDrawerOpen;
  const providerTemplateName =
    providerResolution?.provider?.name ?? (customer.trim() ? customer : document.originalName);

  // All ERP target fields — sourced dynamically from the DB so nothing is hardcoded.
  // Includes header fields, line fields (SKU, qty, price…), and any custom fields.
  const learnableTargets = useMemo<StudioTargetDefinition[]>(
    () =>
      targetFields.map((field) => ({
        key: field.key,
        section: (
          field.scope === "line"    ? "lines"    :
          field.scope === "shipping" || field.scope === "billing" ? "shipping" :
          field.scope === "notes"   ? "notes"    :
          "header"
        ) as ReviewLayoutSectionId,
        label: field.label,
      })),
    [targetFields],
  );

  const learnableTargetMap = useMemo(
    () => new Map(learnableTargets.map((target) => [target.key, target])),
    [learnableTargets],
  );

  const annotationByTarget = useMemo(
    () => new Map(fieldAnnotations.map((annotation) => [annotation.target_field_key, annotation])),
    [fieldAnnotations],
  );

  const studioCandidates = useMemo<StudioFieldCandidate[]>(
    () =>
      detectedFields.map((field, index) => ({
        ...field,
        id: `${field.key}-${field.page}-${index}`,
        group: studioGroupForCategory(field.category),
      })),
    [detectedFields],
  );

  // Promedio de confianza de la extracción IA: solo cuenta campos que reportaron
  // un score numérico. Se muestra en la barra del viewer como indicador rápido
  // de qué tan "seguro" está el modelo del PO completo.
  const aiConfidence = useMemo<number | null>(() => {
    const scores = detectedFields
      .map((f) => f.confidence)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    if (scores.length === 0) return null;
    return scores.reduce((sum, n) => sum + n, 0) / scores.length;
  }, [detectedFields]);

  const studioGroups = useMemo(
    () => [
      { id: "header" as const, label: t("studio.groups.header") },
      { id: "addresses" as const, label: t("studio.groups.addresses") },
      { id: "terms" as const, label: t("studio.groups.terms") },
      { id: "totals" as const, label: t("studio.groups.totals") },
      { id: "lines" as const, label: t("studio.groups.lines") },
      { id: "other" as const, label: t("studio.groups.other") },
    ],
    [t],
  );

  const existingStudioAnnotation = selectedStudioTarget
    ? (annotationByTarget.get(selectedStudioTarget.key) ?? null)
    : null;

  const existingSkuMapping = useMemo(() => {
    const sourceSku = normalizeSearch(skuModalSource?.sku ?? "");
    if (!sourceSku) return null;
    return (
      productMappings.find((mapping) =>
        [mapping.source_sku, mapping.source_company_sku, mapping.source_description]
          .map((value) => normalizeSearch(value ?? ""))
          .includes(sourceSku),
      ) ?? null
    );
  }, [productMappings, skuModalSource]);

  const skuRules = useMemo(() => parseSkuRules(providerSettings.sku_rules), [providerSettings]);

  // Marketplace mode: el provider configuró que el billing se reemplace por la
  // dirección del partner ERP al sincronizar. Avisar al operador antes de aprobar
  // para que no se sorprenda viendo otro billing en el SO de ERP.
  const billingReplacedByOdooPartner = providerSettings.normalize_billing_from_odoo_partner === true;

  // ── Toolbar: estados independientes ──────────────────────────────────────
  // Reloj para tiempos relativos ("hace X min"). Se actualiza una vez por
  // minuto; solo se calcula en cliente para no romper hidratación.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const processedRelative = useMemo(() => {
    if (!document.createdAt) return null;
    const created = new Date(document.createdAt).getTime();
    if (!Number.isFinite(created)) return null;
    const diff = Math.max(0, nowMs - created);
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "hace <1 min";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} d`;
  }, [document.createdAt, nowMs]);

  // Preferencia local de auto-sync a ERP al aprobar. El estado real lo lee
  // approve-button.tsx desde localStorage, pero exponemos un toggle visible
  // en la barra para que el operador sepa qué va a pasar al darle Approve.
  const [autoSyncOdoo, setAutoSyncOdoo] = useState<boolean>(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("intake:odoo-autosync");
      setAutoSyncOdoo(v === null ? true : v === "1");
    } catch { /* SSR / private mode */ }
  }, []);
  function toggleAutoSync() {
    setAutoSyncOdoo((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("intake:odoo-autosync", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  // Atajos de teclado globales para acciones comunes. Solo activos cuando no
  // estás escribiendo en un input/textarea/contenteditable.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        setKeyboardHelpOpen((v) => !v);
        e.preventDefault();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        if (nextDocId) {
          window.location.href = `/review/${nextDocId}`;
          e.preventDefault();
        }
      }
      if (e.key === "k" || e.key === "K") {
        if (prevDocId) {
          window.location.href = `/review/${prevDocId}`;
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextDocId, prevDocId]);

  const productById = useMemo(
    () => new Map(odooProducts.map((product) => [product.odoo_product_id, product])),
    [odooProducts],
  );

  const productsByExactCode = useMemo(() => {
    const map = new Map<string, OdooProductSnapshot[]>();
    for (const product of odooProducts) {
      for (const rawCode of [product.default_code, product.barcode]) {
        const code = normalizeSkuCode(rawCode);
        if (!code) continue;
        map.set(code, [...(map.get(code) ?? []), product]);
      }
    }
    return map;
  }, [odooProducts]);

  const productsByLooseCode = useMemo(() => {
    const map = new Map<string, OdooProductSnapshot[]>();
    for (const product of odooProducts) {
      for (const rawCode of [product.default_code, product.barcode]) {
        const code = normalizeSkuLoose(rawCode);
        if (!code) continue;
        map.set(code, [...(map.get(code) ?? []), product]);
      }
    }
    return map;
  }, [odooProducts]);

  const findUniqueExactProduct = useCallback(
    (value: string | null | undefined) => {
      const matches = productsByExactCode.get(normalizeSkuCode(value)) ?? [];
      return matches.length === 1 ? matches[0] : null;
    },
    [productsByExactCode],
  );

  const findUniqueLooseProduct = useCallback(
    (value: string | null | undefined) => {
      const matches = productsByLooseCode.get(normalizeSkuLoose(value)) ?? [];
      return matches.length === 1 ? matches[0] : null;
    },
    [productsByLooseCode],
  );

  // Auto-resolve descriptions on initial load: any line whose SKU matches an
  // ERP product but has a missing/generic description gets the ERP name +
  // product_id assigned. Runs once per mount and silently — no save trigger
  // (the user's first interaction will save). Covers Supplier Portal, AI-extracted, and
  // manual upload sources uniformly.
  const autoResolvedRef = useRef(false);
  useEffect(() => {
    if (autoResolvedRef.current) return;
    if (productsByExactCode.size === 0) return; // catalog not loaded yet
    autoResolvedRef.current = true;
    setLines((current) => {
      let changed = false;
      const next = current.map((line) => {
        if (line.odoo_product_id !== null) return line;
        const product = findUniqueExactProduct(line.sku);
        if (!product) return line;
        changed = true;
        return {
          ...line,
          description: product.name,
          odoo_product_id: product.odoo_product_id,
        };
      });
      return changed ? next : current;
    });
  }, [productsByExactCode, findUniqueExactProduct, t]);

  const applySkuRule = useCallback((sku: string, rule: SkuRule) => {
    const value = rule.value ?? "";
    if (
      rule.type === "strip_prefix" &&
      value &&
      sku.toUpperCase().startsWith(value.toUpperCase())
    ) {
      return sku.slice(value.length);
    }
    if (rule.type === "strip_suffix" && value && sku.toUpperCase().endsWith(value.toUpperCase())) {
      return sku.slice(0, sku.length - value.length);
    }
    if (rule.type === "strip_separators") {
      return sku.replace(/[\s\-_/\\.]+/g, "");
    }
    return sku;
  }, []);

  const buildSkuSuggestions = useCallback(
    (sku: string, description: string): SkuSuggestion[] => {
      const sourceSku = sku.trim();
      const normalizedSku = normalizeSearch(sourceSku);
      if (!normalizedSku) return [];

      const suggestions: SkuSuggestion[] = [];
      for (const mapping of productMappings) {
        const matchesMapping = [
          mapping.source_sku,
          mapping.source_company_sku,
          mapping.source_description,
        ]
          .map((value) => normalizeSearch(value ?? ""))
          .includes(normalizedSku);
        const product = productById.get(mapping.odoo_product_id);
        if (matchesMapping && product) {
          suggestions.push({
            product,
            reason: "mapping",
            label: t("studio.skuModal.reasons.mapping"),
            transformedSku: mapping.odoo_default_code ?? product.default_code ?? sourceSku,
          });
        }
      }

      const exactProduct = findUniqueExactProduct(sourceSku);
      if (exactProduct) {
        suggestions.push({
          product: exactProduct,
          reason: "exact",
          label: t("studio.skuModal.reasons.exact"),
          transformedSku: exactProduct.default_code ?? sourceSku,
        });
      }

      for (const rule of skuRules) {
        const transformedSku = applySkuRule(sourceSku, rule);
        if (transformedSku === sourceSku) continue;
        const product =
          findUniqueExactProduct(transformedSku) ?? findUniqueLooseProduct(transformedSku);
        if (!product) continue;
        suggestions.push({
          product,
          reason: "rule",
          label: t("studio.skuModal.reasons.rule"),
          transformedSku,
          rule,
        });
      }

      const upperSku = sourceSku.toUpperCase();
      for (const product of odooProducts) {
        for (const rawCode of [product.default_code, product.barcode]) {
          const code = normalizeSkuCode(rawCode);
          if (!code || code === upperSku) continue;

          if (upperSku.endsWith(code)) {
            const prefix = sourceSku.slice(0, sourceSku.length - code.length);
            if (prefix) {
              suggestions.push({
                product,
                reason: "inferred",
                label: t("studio.skuModal.reasons.prefix", { value: prefix }),
                transformedSku: rawCode ?? code,
                rule: { type: "strip_prefix", value: prefix },
              });
            }
          }

          if (upperSku.startsWith(code)) {
            const suffix = sourceSku.slice(code.length);
            if (suffix) {
              suggestions.push({
                product,
                reason: "inferred",
                label: t("studio.skuModal.reasons.suffix", { value: suffix }),
                transformedSku: rawCode ?? code,
                rule: { type: "strip_suffix", value: suffix },
              });
            }
          }
        }
      }

      const looseProduct = findUniqueLooseProduct(sourceSku);
      if (looseProduct && !findUniqueExactProduct(sourceSku)) {
        suggestions.push({
          product: looseProduct,
          reason: "inferred",
          label: t("studio.skuModal.reasons.separators"),
          transformedSku: looseProduct.default_code ?? sourceSku,
          rule: { type: "strip_separators" },
        });
      }

      const descriptionTerms = normalizeSearch(description)
        .split(/\s+/)
        .filter((term) => term.length >= 4)
        .slice(0, 4);
      if (descriptionTerms.length) {
        for (const product of odooProducts) {
          const productName = normalizeSearch(product.name);
          if (descriptionTerms.some((term) => productName.includes(term))) {
            suggestions.push({
              product,
              reason: "description",
              label: t("studio.skuModal.reasons.description"),
              transformedSku: product.default_code ?? sourceSku,
            });
          }
        }
      }

      return uniqueSkuSuggestions(suggestions).slice(0, 10);
    },
    [
      applySkuRule,
      findUniqueExactProduct,
      findUniqueLooseProduct,
      odooProducts,
      productById,
      productMappings,
      skuRules,
      t,
    ],
  );

  const skuModalSuggestions = useMemo(
    () => buildSkuSuggestions(skuModalSource?.sku ?? "", skuModalSource?.description ?? ""),
    [buildSkuSuggestions, skuModalSource],
  );

  const resolvedProductForLine = useCallback(
    (line: EditableLine) => {
      if (line.odoo_product_id) return productById.get(line.odoo_product_id) ?? null;
      if (!line.sku.trim()) return null;

      const suggestions = buildSkuSuggestions(line.sku, line.description);

      // Priority 1: saved mapping (highest confidence — human verified)
      const mappingMatch = suggestions.find((s) => s.reason === "mapping");
      if (mappingMatch) return mappingMatch.product;

      // Priority 2: exact code match in ERP catalog — auto-resolve without user click
      // Even if there are inferred suggestions alongside, exact wins unambiguously
      const exactMatch = suggestions.find((s) => s.reason === "exact");
      if (exactMatch) return exactMatch.product;

      // Priority 3: single unambiguous non-description suggestion
      const nonDesc = suggestions.filter((s) => s.reason !== "description");
      return nonDesc.length === 1 ? nonDesc[0].product : null;
    },
    [buildSkuSuggestions, productById],
  );

  const lineHasReviewValue = useCallback(
    (line: EditableLine, key: string) => {
      if (key === "product_id") return Boolean(resolvedProductForLine(line));
      return lineHasValue(line, key);
    },
    [resolvedProductForLine],
  );

  const filteredSkuProducts = useMemo(() => {
    const query = normalizeSearch(skuProductQuery);
    if (!query) return odooProducts.slice(0, 80);
    return odooProducts
      .filter((product) =>
        [product.name, product.default_code, product.barcode, product.uom_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 80);
  }, [odooProducts, skuProductQuery]);

  const targetFieldLabel = useCallback(
    (field: TargetFieldSnapshot) => {
      switch (field.key) {
        case "partner_id":
          return t("fields.customer");
        case "customer_address":
          return t("fields.customerAddress");
        case "shipping_address":
          return t("fields.deliveryAddress");
        case "billing_address":
          return t("fields.billingAddress");
        case "client_order_ref":
          return t("fields.poNumber");
        case "date_order":
          return t("fields.poDate");
        case "currency_id":
          return t("fields.currency");
        case "note":
          return t("fields.notes");
        case "product_id":
          return t("lines.sku");
        case "product_uom_qty":
          return t("lines.qty");
        case "price_unit":
          return t("lines.unitPrice");
        case "name":
          return t("lines.description");
        case "tax_id":
          return t("lines.taxRate");
        default:
          return field.label;
      }
    },
    [t],
  );

  const computedTotals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const taxTotal = lines.reduce((sum, line) => sum + lineTotal(line) * numeric(line.tax_rate), 0);
    return {
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
    };
  }, [lines]);
  const currentTotal = dirty ? computedTotals.total : savedTotals.total;
  const linesHaveNoPrices = lines.length > 0 && lines.every((l) => !numeric(l.unit_price));
  const missingRequiredFields = useMemo(() => {
    const missing: TargetFieldSnapshot[] = [];

    for (const field of targetFields) {
      if (!field.required) continue;

      if (field.scope === "line") {
        if (!lines.length || lines.some((line) => !lineHasReviewValue(line, field.key))) {
          missing.push(field);
        }
        continue;
      }

      const present =
        field.key === "partner_id"
          ? hasText(customer)
          : field.key === "customer_address"
            ? hasText(customerAddress)
            : field.key === "shipping_address"
              ? addressHasContent(deliveryAddress)
              : field.key === "billing_address"
                ? addressHasContent(billingAddress)
                : field.key === "client_order_ref"
                  ? hasText(poNumber)
                  : field.key === "date_order"
                    ? hasText(poDate)
                    : field.key === "currency_id"
                      ? hasText(currency)
                      : field.key === "note"
                        ? hasText(notes)
                        : true;

      if (!present) {
        missing.push(field);
      }
    }

    return missing;
  }, [
    billingAddress,
    currency,
    customer,
    customerAddress,
    deliveryAddress,
    lineHasReviewValue,
    lines,
    notes,
    poDate,
    poNumber,
    targetFields,
  ]);
  const missingRequiredKeys = useMemo(
    () => new Set(missingRequiredFields.map((field) => field.key)),
    [missingRequiredFields],
  );
  const requiredKeys = useMemo(
    () => new Set(targetFields.filter((field) => field.required).map((field) => field.key)),
    [targetFields],
  );
  const requiredLineFields = useMemo(
    () => targetFields.filter((field) => field.required && field.scope === "line"),
    [targetFields],
  );
  const missingRequiredLabels = useMemo(
    () => missingRequiredFields.map((field) => targetFieldLabel(field)),
    [missingRequiredFields, targetFieldLabel],
  );

  // ── Toolbar: estados que dependen de variables derivadas más arriba ──────
  // Semáforo "listo para aprobar": evita que el operador apriete Approve y
  // reciba un 422 del server. Cubre los checks que el backend valida.
  const buyerOk = Boolean(initialProviderResolution.reseller_mapping?.odoo_partner_id) || Boolean(customer);
  const providerOk = Boolean(providerResolution?.document?.resolved);
  const linesOk = lines.length > 0;
  const missingCount = missingRequiredLabels.length;
  const readyToApprove = buyerOk && providerOk && linesOk && missingCount === 0;

  // Total en formato de moneda compacto para la barra.
  const totalDisplay = useMemo(() => {
    if (typeof currentTotal !== "number" || !Number.isFinite(currentTotal)) return null;
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
      }).format(currentTotal);
    } catch {
      return `${currency || "$"} ${currentTotal.toFixed(2)}`;
    }
  }, [currentTotal, currency, locale]);

  const pdfHighlights = useMemo<PdfOverlayHighlight[]>(() => {
    const headerHighlights: PdfOverlayHighlight[] = [
      {
        id: "po-number",
        label: t("fields.poNumber"),
        page: 1,
        tone: "blue",
        searchTerms: uniqueTerms([poNumber]),
      },
      {
        id: "po-date",
        label: t("fields.poDate"),
        page: 1,
        tone: "blue",
        searchTerms: dateTerms(poDate),
      },
      {
        id: "customer",
        label: t("fields.customer"),
        page: 1,
        tone: "teal",
        searchTerms: uniqueTerms([customer]),
      },
      {
        id: "total",
        label: t("fields.total"),
        page: 1,
        tone: "amber",
        searchTerms: moneyTerms(currentTotal, currency, locale),
      },
    ];

    const lineHighlights = lines.slice(0, 8).map(
      (line): PdfOverlayHighlight => ({
        id: `line-${line.clientId}`,
        label: line.description || t("lines.newLine"),
        page: 1,
        tone: "rose",
        searchTerms: uniqueTerms([line.description, line.sku]),
      }),
    );

    const extractionHighlights = detectedFields.map(
      (field, index): PdfOverlayHighlight => ({
        id: `detected-${field.key}-${index}`,
        label: field.label,
        value: field.value,
        page: field.page,
        tone: highlightTone(field.category),
        searchTerms: uniqueTerms([field.value, field.label]),
        rects: field.rects?.map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })),
        provenance: field.rects?.[0]?.provenance ?? field.provenance ?? undefined,
      }),
    );

    return extractionHighlights.length
      ? extractionHighlights
      : [...headerHighlights, ...lineHighlights];
  }, [currency, currentTotal, customer, detectedFields, lines, locale, poDate, poNumber, t]);
  const hasResellerMapping = useMemo(
    () => Boolean(providerResolution?.reseller_mapping?.odoo_partner_id),
    [providerResolution?.reseller_mapping?.odoo_partner_id],
  );
  const resellerCandidates = providerResolution?.candidates ?? [];
  const providerDisplayName =
    providerResolution?.provider?.name?.trim() || document.providerId || "Sin proveedor detectado";
  const mappedPartnerName = providerResolution?.reseller_mapping?.odoo_partner_name?.trim() || null;
  const _showingSameProviderAndPartner =
    Boolean(mappedPartnerName) &&
    providerDisplayName.localeCompare(mappedPartnerName ?? "", undefined, {
      sensitivity: "base",
    }) === 0;
  void _showingSameProviderAndPartner;
  const incompleteLineCount = requiredLineFields.length
    ? lines.filter((line) =>
        requiredLineFields.some((field) => !lineHasReviewValue(line, field.key)),
      ).length
    : 0;
  const reviewIssuesCount =
    missingRequiredFields.length + incompleteLineCount + (hasResellerMapping ? 0 : 1);

  function markDirty() {
    if (isEditable) {
      setDirty(true);
    }
  }

  function openResellerDialog() {
    setResellerDialogOpen(true);
    setSelectedResellerId(providerResolution?.reseller_mapping?.odoo_partner_id ?? null);
    setResellerQuery(mappedPartnerName ?? providerDisplayName);
  }

  function updateLine(clientId: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => (line.clientId === clientId ? { ...line, ...patch } : line)),
    );
    markDirty();
  }

  // Auto-resolve SKU on blur: if the typed SKU exactly matches one ERP
  // product (default_code or barcode), fill in description + odoo_product_id
  // from ERP and save. Works for all sources — manual upload, AI-extracted,
  // Supplier Portal. The user can still edit the description after if needed.
  function handleSkuBlur(clientId: string) {
    setLines((current) => {
      const idx = current.findIndex((l) => l.clientId === clientId);
      if (idx < 0) return current;
      const line = current[idx];
      const product = findUniqueExactProduct(line.sku);
      if (!product) {
        // No match — just save what's there
        void saveReview();
        return current;
      }
      // Exact match found — patch description + odoo_product_id
      const next = [...current];
      next[idx] = {
        ...line,
        description: product.name,
        odoo_product_id: product.odoo_product_id,
      };
      void saveReview({ lines: next }, { force: true });
      return next;
    });
  }

  function addLine() {
    const newLine: EditableLine = {
      id: null,
      clientId: crypto.randomUUID(),
      sku: "",
      customer_sku: "",
      description: t("lines.newLine"),
      quantity: "1",
      unit: "",
      unit_price: "0",
      tax_rate: "",
      odoo_product_id: null,
      kind: "item",
    };
    const nextLines = [...lines, newLine];
    setLines(nextLines);
    setOpenLine(newLine.clientId);
    markDirty();
    void saveReview({ lines: nextLines }, { force: true });
  }

  function removeLine(clientId: string) {
    if (lines.length <= 1) return;

    const nextLines = lines.filter((line) => line.clientId !== clientId);
    setLines(nextLines);
    if (openLine === clientId) {
      setOpenLine(nextLines[0]?.clientId ?? "");
    }
    markDirty();
    void saveReview({ lines: nextLines }, { force: true });
  }

  async function saveReview(
    overrides: SaveReviewOverrides = {},
    options: { force?: boolean } = {},
  ) {
    if (!isEditable) return false;
    // If a save is already in-flight, queue a re-save for when it finishes
    // (prevents edits made during addLine/save from being silently dropped)
    if (saving) {
      resaveNeededRef.current = true;
      return false;
    }
    if (!dirty && !options.force && Object.keys(overrides).length === 0) return true;

    const nextPoNumber = overrides.poNumber ?? poNumber;
    const nextPoDate = overrides.poDate ?? poDate;
    const nextDeliveryDate = overrides.deliveryDate ?? deliveryDate;
    const nextCurrency = overrides.currency ?? currency;
    const nextPaymentTerms = overrides.paymentTerms ?? paymentTerms;
    const nextCustomer = overrides.customer ?? customer;
    const nextCustomerContactPerson =
      overrides.customerContactPerson ?? customerContactPerson;
    const nextCustomerAddress = overrides.customerAddress ?? customerAddress;
    const nextDeliveryAddress = overrides.deliveryAddress ?? deliveryAddress;
    const nextBillingAddress = overrides.billingAddress ?? billingAddress;
    const nextNotes = overrides.notes ?? notes;
    const nextLines = overrides.lines ?? lines;

    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetch(`/api/order-drafts/${initialDraft.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            po_number: nextPoNumber,
            po_date: nextPoDate,
            delivery_date: nextDeliveryDate,
            currency: nextCurrency,
            payment_terms: nextPaymentTerms,
            customer_name: nextCustomer,
            customer_contact_person: nextCustomerContactPerson,
            customer_address: nextCustomerAddress,
            delivery_address: nextDeliveryAddress,
            billing_address: nextBillingAddress,
            notes: nextNotes,
          },
          lines: nextLines.map((line) => ({
            id: line.id,
            sku: line.sku,
            customer_sku: line.customer_sku || null,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            tax_rate: line.tax_rate,
            odoo_product_id:
              line.odoo_product_id ?? resolvedProductForLine(line)?.odoo_product_id ?? null,
            kind: line.kind ?? "item",
          })),
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SaveReviewError;
        throw new Error(errorBody.detail || errorBody.error || "save_failed");
      }

      const body = (await response.json()) as {
        draft?: DraftSnapshot;
        lines?: LineSnapshot[];
      };

      if (body.lines) {
        const nextSavedLines = body.lines.map(toLineState);
        setLines(nextSavedLines);
        setOpenLine((current) =>
          nextSavedLines.some((line) => line.clientId === current)
            ? current
            : (nextSavedLines.at(-1)?.clientId ?? ""),
        );
      }
      if (body.draft) {
        setSavedTotals({
          subtotal: body.draft.subtotal,
          taxTotal: body.draft.tax_total,
          total: body.draft.total,
        });
      }
      setDirty(false);
      return true;
    } catch (error) {
      setSaveError(true);
      const message =
        error instanceof Error && error.message && error.message !== "save_failed"
          ? error.message
          : t("errors.saveFailed");
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
      // If any change came in while we were saving, trigger a follow-up save now
      if (resaveNeededRef.current) {
        resaveNeededRef.current = false;
        // Small tick so React state settles before the next save reads it
        setTimeout(() => void saveReview({}, { force: true }), 50);
      }
    }
  }

  async function reanalyzeDocument() {
    if (!isEditable || reanalyzing) return;

    setReanalyzing(true);
    try {
      const saved = await saveReview({}, { force: dirty });
      if (!saved) return;

      const response = await fetch(`/api/order-drafts/${initialDraft.id}/reanalyze`, {
        method: "POST",
      });

      if (!response.ok) {
        toast.error(t("errors.reanalyzeFailed"));
        return;
      }

      toast.success(t("reanalyzeQueued"));
      router.replace("/inbox");
      router.refresh();
    } catch {
      toast.error(t("errors.reanalyzeFailed"));
    } finally {
      setReanalyzing(false);
    }
  }

  async function assignReseller(explicitResellerId?: number) {
    const providerId = providerResolution?.provider?.id ?? document.providerId;
    const resellerId = explicitResellerId ?? selectedResellerId;
    const selected = providerResolution?.candidates.find(
      (candidate) => candidate.id === resellerId,
    );
    if (!resellerId || !selected) {
      toast.error(t("toasts.selectValidReseller"));
      return;
    }

    setResolutionSaving(true);
    try {
      const response = await fetch(`/api/review/documents/${document.id}/provider-resolution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          odoo_partner_id: resellerId,
          odoo_partner_name: selected.name,
        }),
      });
      if (!response.ok) throw new Error("assign_failed");

      toast.success(t("toasts.resellerAssigned"));

      // Load provider's saved Studio annotations and apply them to this document.
      // This is the "multiple mapping methods" path: when a provider is manually
      // assigned, all previously learned field rules fire automatically.
      if (providerId) {
        void loadAndApplyProviderAnnotations(providerId);
      }

      setProviderResolution((current) =>
        current
          ? {
              ...current,
              reseller_mapping: {
                odoo_partner_id: resellerId,
                odoo_partner_name: selected.name,
              },
              document: {
                ...current.document,
                resolved: Boolean(
                  current.document.provider_id && current.document.review_profile_id && resellerId,
                ),
              },
            }
          : current,
      );
      await refreshProviderResolution(resellerQuery, { syncSelection: true });
      setResellerDialogOpen(false);
    } catch {
      toast.error(t("toasts.resellerAssignFailed"));
    } finally {
      setResolutionSaving(false);
    }
  }

  function selectStudioTarget(targetKey: string) {
    if (!studioMode) return;
    const target = learnableTargetMap.get(targetKey);
    if (!target) return;
    setSelectedStudioTarget(target);
  }

  function selectStudioField(field: StudioFieldCandidate) {
    if (!studioMode) return;
    if (!selectedStudioTarget) {
      toast.error(t("studio.toasts.pickTargetFirst"));
      return;
    }
    setPendingStudioField(field);
    setMappingModalOpen(true);
  }

  async function confirmStudioMapping() {
    if (!selectedStudioTarget || !pendingStudioField) return;
    const providerId = providerResolution?.provider?.id ?? document.providerId;
    if (!providerId) {
      toast.error(t("studio.toasts.providerRequired"));
      return;
    }

    setSavingStudioMapping(true);
    try {
      const response = await fetch(`/api/review/documents/${document.id}/field-annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          target_field_key: selectedStudioTarget.key,
          source_hint: pendingStudioField.label || pendingStudioField.key,
          normalized_text: pendingStudioField.value,
          selection_meta: {
            extracted_key: pendingStudioField.key,
            extracted_label: pendingStudioField.label,
            extracted_category: pendingStudioField.category,
            extracted_confidence: pendingStudioField.confidence,
            extracted_provenance: pendingStudioField.provenance ?? null,
            extracted_source: pendingStudioField.source,
            page: pendingStudioField.page,
          },
        }),
      });
      if (!response.ok) throw new Error("mapping_failed");

      const replacement = existingStudioAnnotation;
      const nextAnnotation: FieldAnnotationSnapshot = {
        id: replacement?.id ?? crypto.randomUUID(),
        target_field_key: selectedStudioTarget.key,
        source_hint: pendingStudioField.label || pendingStudioField.key,
        normalized_text: pendingStudioField.value,
        selection_meta: {
          extracted_key: pendingStudioField.key,
          extracted_label: pendingStudioField.label,
          extracted_category: pendingStudioField.category,
          extracted_confidence: pendingStudioField.confidence,
          extracted_provenance: pendingStudioField.provenance ?? null,
          extracted_source: pendingStudioField.source,
          page: pendingStudioField.page,
        },
        created_at: replacement?.created_at ?? new Date().toISOString(),
      };
      setFieldAnnotations((current) => {
        const filtered = current.filter(
          (item) => item.target_field_key !== selectedStudioTarget.key,
        );
        return [...filtered, nextAnnotation];
      });
      setMappingModalOpen(false);
      setPendingStudioField(null);

      // ── Apply value immediately to the current document ───────────────
      // Studio mapping teaches future extractions AND fills this document now.
      const extractedValue = pendingStudioField.value?.trim() ?? "";
      if (extractedValue) {
        applyStudioValueToForm(selectedStudioTarget.key, extractedValue);
      }

      toast.success(t("studio.toasts.mappingSaved", { field: selectedStudioTarget.label }));
    } catch {
      toast.error(t("studio.toasts.mappingFailed"));
    } finally {
      setSavingStudioMapping(false);
    }
  }

  // Fetch a provider's saved Studio annotations and apply them to the current
  // document using the detected fields. Called when a provider is manually assigned.
  async function loadAndApplyProviderAnnotations(providerId: string) {
    try {
      const res = await fetch(
        `/api/review/documents/${document.id}/field-annotations?provider_id=${encodeURIComponent(providerId)}`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { items?: FieldAnnotationSnapshot[] };
      const items = body.items ?? [];
      if (items.length === 0) return;

      // Update local annotation state so Studio shows current mappings
      setFieldAnnotations(items);

      // For each annotation, find the matching detected field in THIS document
      // and apply its value to the form field
      let applied = 0;
      for (const annotation of items) {
        const extractedKey =
          typeof annotation.selection_meta?.extracted_key === "string"
            ? annotation.selection_meta.extracted_key
            : null;
        const extractedLabel =
          typeof annotation.selection_meta?.extracted_label === "string"
            ? annotation.selection_meta.extracted_label
            : null;

        const matchingField = detectedFields.find(
          (f) =>
            (extractedKey && f.key === extractedKey) ||
            (extractedLabel && f.label === extractedLabel),
        );

        if (matchingField?.value?.trim()) {
          applyStudioValueToForm(annotation.target_field_key, matchingField.value.trim());
          applied++;
        }
      }

      if (applied > 0) {
        toast.success(
          `${applied} template rule${applied === 1 ? "" : "s"} applied from provider template`,
        );
      }
    } catch {
      // Silent — annotations are enhancement, not critical
    }
  }

  // Apply a confirmed Studio mapping to the live form immediately.
  // Computes new values synchronously and passes them as overrides to
  // saveReview so the save uses the updated data, not the stale closure state.
  function applyStudioValueToForm(targetKey: string, value: string) {
    const overrides: SaveReviewOverrides = {};

    // ── Header fields ─────────────────────────────────────────────────
    switch (targetKey) {
      case "client_order_ref":
        overrides.poNumber = value;
        setPoNumber(value);
        break;
      case "date_order":
        overrides.poDate = value;
        setPoDate(value);
        break;
      case "currency_id":
        overrides.currency = value.toUpperCase().slice(0, 3);
        setCurrency(value.toUpperCase().slice(0, 3));
        break;
      case "payment_terms":
      case "payment_term_id":
        overrides.paymentTerms = value;
        setPaymentTerms(value);
        break;
      case "partner_id":
        overrides.customer = value;
        setCustomer(value);
        break;
      case "customer_address":
        overrides.customerAddress = value;
        setCustomerAddress(value);
        break;
      case "note":
        overrides.notes = value;
        setNotes(value);
        break;
      default:
        break;
    }

    // ── Line fields ───────────────────────────────────────────────────
    const lineFieldMap: Partial<Record<string, keyof EditableLine>> = {
      sku: "sku",
      product_uom_qty: "quantity",
      price_unit: "unit_price",
      name: "description",
      product_uom: "unit",
      tax_id: "tax_rate",
    };

    const lineField = lineFieldMap[targetKey];
    if (lineField) {
      // Compute new lines synchronously and pass as override
      const newLines = lines.map((line) => ({ ...line, [lineField]: value }));
      setLines(newLines);
      overrides.lines = newLines;
    }

    if (Object.keys(overrides).length > 0) {
      markDirty();
      void saveReview(overrides, { force: true });
    }
  }

  function openSkuReplacement(params: {
    sku: string;
    description: string;
    lineId?: string | null;
  }) {
    if (!(providerResolution?.provider?.id ?? document.providerId)) {
      toast.error(t("studio.toasts.providerRequired"));
      return;
    }
    const normalizedSku = normalizeSearch(params.sku);
    const existing = productMappings.find((mapping) =>
      [mapping.source_sku, mapping.source_company_sku, mapping.source_description]
        .map((value) => normalizeSearch(value ?? ""))
        .includes(normalizedSku),
    );
    const firstSuggestion = buildSkuSuggestions(params.sku, params.description)[0];
    setSkuModalSource(params);
    setSkuProductQuery("");
    setSelectedSkuProductId(
      existing?.odoo_product_id ?? firstSuggestion?.product.odoo_product_id ?? null,
    );
    setSelectedSkuRule(existing ? null : (firstSuggestion?.rule ?? null));
    setSkuModalOpen(true);
  }

  async function confirmSkuReplacement() {
    const providerId = providerResolution?.provider?.id ?? document.providerId;
    const product = odooProducts.find((item) => item.odoo_product_id === selectedSkuProductId);
    const sourceSku = skuModalSource?.sku?.trim();
    if (!providerId || !product || !sourceSku) return;

    setSavingSkuMapping(true);
    try {
      const response = await fetch("/api/settings/providers/product-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          source_sku: sourceSku,
          source_description: skuModalSource?.description ?? null,
          odoo_product_id: product.odoo_product_id,
          odoo_product_name: product.name,
          odoo_default_code: product.default_code,
          sku_rule: selectedSkuRule,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { item?: ProductMappingSnapshot };
      if (!response.ok || !body.item) throw new Error("sku_mapping_failed");
      setProductMappings((current) => {
        const filtered = current.filter((mapping) => mapping.id !== body.item?.id);
        return [body.item!, ...filtered];
      });

      if (skuModalSource?.lineId) {
        const nextLines = lines.map((line) =>
          line.clientId === skuModalSource.lineId
            ? { ...line, odoo_product_id: product.odoo_product_id }
            : line,
        );
        setLines(nextLines);
        setDirty(true);
        const saved = await saveReview({ lines: nextLines }, { force: true });
        if (!saved) {
          throw new Error("sku_line_save_failed");
        }
      }

      setSkuModalOpen(false);
      toast.success(t("studio.toasts.skuMappingSaved"));
    } catch (error) {
      if (error instanceof Error && error.message === "sku_line_save_failed") {
        toast.error("El SKU se mapeó, pero la línea del documento no se pudo guardar.");
      } else {
        toast.error(t("studio.toasts.skuMappingFailed"));
      }
    } finally {
      setSavingSkuMapping(false);
    }
  }

  const displayedTotals = dirty ? computedTotals : savedTotals;

  const reviewLayout = useMemo<ReviewLayoutConfig>(() => {
    const fallbackSections: ReviewLayoutSection[] = [
      { id: "header", label: t("header.title"), enabled: true, order: 0 },
      { id: "shipping", label: t("shipping.title"), enabled: true, order: 1 },
      { id: "lines", label: t("lines.shortTitle"), enabled: true, order: 2 },
      { id: "notes", label: t("fields.notes"), enabled: true, order: 3 },
    ];

    if (!profileLayout || typeof profileLayout !== "object" || Array.isArray(profileLayout)) {
      return {
        default_section: "header",
        sections: fallbackSections,
        field_sections: {},
        field_order: {},
      };
    }

    const layoutRecord = profileLayout as Record<string, unknown>;
    const rawSections = Array.isArray(layoutRecord.sections) ? layoutRecord.sections : [];
    const sectionMap = new Map<ReviewLayoutSectionId, ReviewLayoutSection>();

    for (const rawSection of rawSections) {
      if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) continue;
      const section = rawSection as Record<string, unknown>;
      const id = section.id;
      if (id !== "header" && id !== "shipping" && id !== "lines" && id !== "notes") continue;
      sectionMap.set(id, {
        id,
        label:
          typeof section.label === "string" && section.label.trim()
            ? section.label.trim()
            : (fallbackSections.find((item) => item.id === id)?.label ?? id),
        enabled: section.enabled !== false,
        order:
          typeof section.order === "number" && Number.isFinite(section.order)
            ? section.order
            : (fallbackSections.find((item) => item.id === id)?.order ?? 99),
      });
    }

    const sections = (["header", "shipping", "lines", "notes"] as ReviewLayoutSectionId[])
      .map(
        (id) =>
          sectionMap.get(id) ??
          fallbackSections.find((item) => item.id === id) ?? {
            id,
            label: id,
            enabled: true,
            order: 99,
          },
      )
      .sort((a, b) => a.order - b.order);

    const defaultSectionRaw = layoutRecord.default_section;
    const defaultSection =
      defaultSectionRaw === "header" ||
      defaultSectionRaw === "shipping" ||
      defaultSectionRaw === "lines" ||
      defaultSectionRaw === "notes"
        ? defaultSectionRaw
        : (sections.find((section) => section.enabled)?.id ?? "header");

    const rawFieldSections = layoutRecord.field_sections;
    const fieldSections: Partial<Record<string, ReviewLayoutSectionId>> = {};
    if (
      rawFieldSections &&
      typeof rawFieldSections === "object" &&
      !Array.isArray(rawFieldSections)
    ) {
      for (const [key, value] of Object.entries(rawFieldSections as Record<string, unknown>)) {
        if (!key.trim()) continue;
        if (value === "header" || value === "shipping" || value === "lines" || value === "notes") {
          fieldSections[key.trim()] = value;
        }
      }
    }

    const rawFieldOrder = layoutRecord.field_order;
    const fieldOrder: Partial<Record<string, number>> = {};
    if (rawFieldOrder && typeof rawFieldOrder === "object" && !Array.isArray(rawFieldOrder)) {
      for (const [key, value] of Object.entries(rawFieldOrder as Record<string, unknown>)) {
        if (!key.trim()) continue;
        if (typeof value === "number" && Number.isFinite(value)) {
          fieldOrder[key.trim()] = Math.max(0, Math.floor(value));
        }
      }
    }

    return {
      default_section: defaultSection,
      sections,
      field_sections: fieldSections,
      field_order: fieldOrder,
    };
  }, [profileLayout, t]);

  const fieldSections = useMemo(() => {
    if (!reviewLayout.field_sections || typeof reviewLayout.field_sections !== "object") {
      return {} as Partial<Record<string, ReviewLayoutSectionId>>;
    }
    return reviewLayout.field_sections;
  }, [reviewLayout.field_sections]);

  const fieldOrder = useMemo(() => {
    if (!reviewLayout.field_order || typeof reviewLayout.field_order !== "object") {
      return {} as Partial<Record<string, number>>;
    }
    return reviewLayout.field_order;
  }, [reviewLayout.field_order]);

  const fieldInSection = useCallback(
    (key: string, fallback: ReviewLayoutSectionId) => {
      const configured = fieldSections[key];
      return configured ?? fallback;
    },
    [fieldSections],
  );

  const orderedFieldKeys = useCallback(
    (keys: string[]) =>
      [...keys].sort((a, b) => {
        const aOrder = fieldOrder[a] ?? Number.POSITIVE_INFINITY;
        const bOrder = fieldOrder[b] ?? Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return keys.indexOf(a) - keys.indexOf(b);
      }),
    [fieldOrder],
  );

  const orderedHeaderKeys = orderedFieldKeys(
    ["client_order_ref", "date_order", "currency_id", "partner_id", "customer_address"].filter(
      (key) => fieldInSection(key, "header") === "header",
    ),
  );
  const orderedShippingKeys = orderedFieldKeys(
    ["shipping_address", "billing_address"].filter(
      (key) => fieldInSection(key, "shipping") === "shipping",
    ),
  );
  const orderedLineKeys = orderedFieldKeys(
    ["name", "product_id", "product_uom_qty", "price_unit", "tax_id"].filter(
      (key) => fieldInSection(key, "lines") === "lines",
    ),
  );
  const showNotesField = fieldInSection("note", "notes") === "notes";
  const showHeaderPoNumber = orderedHeaderKeys.includes("client_order_ref");
  const showHeaderPoDate = orderedHeaderKeys.includes("date_order");
  const showHeaderCurrency = orderedHeaderKeys.includes("currency_id");
  const showHeaderCustomer = orderedHeaderKeys.includes("partner_id");
  const showHeaderCustomerAddress = orderedHeaderKeys.includes("customer_address");
  const showShippingDelivery = orderedShippingKeys.includes("shipping_address");
  const showShippingBilling = orderedShippingKeys.includes("billing_address");
  const orderedHeaderTopKeys = orderedHeaderKeys.filter(
    (key) => key === "client_order_ref" || key === "date_order" || key === "currency_id",
  );
  const orderedHeaderBottomKeys = orderedHeaderKeys.filter(
    (key) => key === "partner_id" || key === "customer_address",
  );

  const visibleSections = useMemo<ReviewLayoutSection[]>(() => {
    const enabled = reviewLayout.sections.filter((section) => section.enabled);
    return enabled.length
      ? enabled
      : [
          {
            id: "header",
            label: t("header.title"),
            enabled: true,
            order: 0,
          } satisfies ReviewLayoutSection,
        ];
  }, [reviewLayout.sections, t]);

  const defaultReviewTab = useMemo<ReviewLayoutSectionId>(() => {
    const linesTabEnabled = visibleSections.some((section) => section.id === "lines");
    if (incompleteLineCount > 0 && linesTabEnabled) return "lines" as ReviewLayoutSectionId;
    if (visibleSections.some((section) => section.id === reviewLayout.default_section)) {
      return reviewLayout.default_section;
    }
    return visibleSections[0]?.id ?? "header";
  }, [incompleteLineCount, reviewLayout.default_section, visibleSections]);

  // AI cost from extraction payload (ai_usage.actual_cost_usd)
  const aiCostUsd = useMemo(() => {
    if (!extractionPayload || typeof extractionPayload !== "object") return null;
    const ai = (extractionPayload as Record<string, unknown>).ai_usage;
    if (!ai || typeof ai !== "object") return null;
    const cost = (ai as Record<string, unknown>).actual_cost_usd;
    return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
  }, [extractionPayload]);

  const extractionJson = useMemo(
    () => JSON.stringify(extractionPayload ?? {}, null, 2),
    [extractionPayload],
  );
  const studioFieldsByGroup = useMemo(
    () =>
      studioGroups.map((group) => ({
        ...group,
        items: studioCandidates.filter((candidate) => candidate.group === group.id),
      })),
    [studioCandidates, studioGroups],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg)]">
      {!isEditable && (
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-mute)] px-4 py-2 text-xs font-medium text-[var(--color-fg)]">
          <Lock size={13} aria-hidden="true" className="text-[var(--color-fg-mute)]" />
          <span>{t("lockedBanner")}</span>
        </div>
      )}
      {isEditable && !detectedResolved && (
        <div className="border-b border-[color:var(--color-amber)]/25 bg-[color:var(--color-amber)]/8 px-4 py-2 text-xs text-[color:var(--color-amber)]">
          {t("blockedApprovalBanner")}
        </div>
      )}

      {/* ── Intelligent Document Routing banner ────────────────────────── */}
      {isEditable &&
        !routingBannerDismissed &&
        providerResolution?.provider &&
        !providerResolution?.document?.review_profile_id && (
          <div
            className={cn(
              "flex items-center gap-3 border-b px-4 py-2.5",
              "border-[color:var(--color-blue)]/20 bg-[color:var(--color-blue)]/5",
            )}
          >
            <Sparkles
              size={13}
              className="shrink-0 text-[color:var(--color-blue)]"
              aria-hidden="true"
            />
            <span className="flex-1 text-xs font-medium text-[color:var(--color-blue)]">
              Looks like a <strong>{providerResolution.provider.name}</strong> order — no template
              assigned yet
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(true);
                  setMobileTab("edit");
                  setResellerDialogOpen(true);
                  setRoutingBannerDismissed(true);
                }}
                className="rounded-[var(--radius-sm)] border border-[color:var(--color-blue)]/30 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--color-blue)] transition-colors hover:bg-[color:var(--color-blue)]/10"
              >
                Configurar partner
              </button>
              <button
                type="button"
                onClick={() => setRoutingBannerDismissed(true)}
                className="flex size-5 items-center justify-center rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
                aria-label="Dismiss"
              >
                <Minus size={12} />
              </button>
            </div>
          </div>
        )}

      {/* ── Mobile tab bar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-[var(--color-border)] xl:hidden">
        {[
          { id: "pdf" as const, label: t("pdfPreview"), icon: FileText },
          { id: "edit" as const, label: t("details.title"), icon: ScanEye },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium",
              "border-b-2 transition-colors duration-[120ms]",
              mobileTab === id
                ? "border-[var(--color-fg)] text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
            )}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            "hidden xl:flex",
            mobileTab === "pdf" && "!flex",
          )}
        >
          {/* ── Toolbar ────────────────────────────────────────────────────── */}
          <TooltipProvider delayDuration={300}>
            {/* ── BLACK TOOLBAR ── */}
            <div className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-black/20 px-3" style={{ backgroundColor: "#38393c" }}>

              {/* Left: back + doc context */}
              <Link
                href="/inbox"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-white/50 transition-all hover:bg-white/10 hover:text-white"
                aria-label={t("backToInbox")}
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </Link>

              {/* Prev/Next entre pendientes del inbox (J/K shortcuts) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={prevDocId ? `/review/${prevDocId}` : "#"}
                    aria-disabled={!prevDocId}
                    onClick={(e) => { if (!prevDocId) e.preventDefault(); }}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded text-white/55 transition-all hover:bg-white/10 hover:text-white",
                      !prevDocId && "pointer-events-none opacity-30",
                    )}
                    aria-label="Anterior pendiente"
                  >
                    <ChevronsLeft size={14} aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Pendiente anterior · K</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={nextDocId ? `/review/${nextDocId}` : "#"}
                    aria-disabled={!nextDocId}
                    onClick={(e) => { if (!nextDocId) e.preventDefault(); }}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded text-white/55 transition-all hover:bg-white/10 hover:text-white",
                      !nextDocId && "pointer-events-none opacity-30",
                    )}
                    aria-label="Siguiente pendiente"
                  >
                    <ChevronsRight size={14} aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Pendiente siguiente · J</TooltipContent>
              </Tooltip>

              <div className="mx-1.5 h-5 w-px shrink-0 bg-white/15" />

              {/* Grupo: identidad del documento (PO + meta sutil) */}
              <div className="flex min-w-0 shrink flex-col justify-center pl-1">
                <span className="flex max-w-[220px] items-center gap-1.5 text-[13px] leading-none font-semibold text-white">
                  <span className="truncate">{poNumber || document.originalName}</span>
                  {dirty && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-400" aria-label="Cambios sin guardar" />
                      </TooltipTrigger>
                      <TooltipContent>Cambios sin guardar</TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <span className="mt-0.5 flex max-w-[300px] items-center gap-1 truncate text-[10px] leading-none text-white/45">
                  <span className="font-mono">#{document.docNumber ?? document.id.slice(0, 8).toUpperCase()}</span>
                  {providerResolution?.provider?.name ? (
                    <>
                      <span className="text-white/25">·</span>
                      <span className="truncate">{providerResolution.provider.name}</span>
                    </>
                  ) : null}
                  {processedRelative && (
                    <>
                      <span className="text-white/25">·</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-0.5 text-white/55">
                            <Clock size={9} aria-hidden="true" />
                            {processedRelative}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Procesado · {document.createdAt}</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </span>
              </div>

              {/* Grupo: metadata / estado del draft.
                  Profile, marketplace y sync van aquí para sacar ruido del subtitle. */}
              {(reviewProfileName || billingReplacedByOdooPartner || (initialDraft.sync_state && initialDraft.sync_state !== "idle" && initialDraft.sync_state !== "draft")) && (
                <>
                  <div className="mx-1.5 h-5 w-px shrink-0 bg-white/15" />
                  <div className="flex shrink-0 items-center gap-1">
                    {reviewProfileName && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-white/75">
                            <Tag size={10} aria-hidden="true" />
                            {reviewProfileName}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Profile de extracción</TooltipContent>
                      </Tooltip>
                    )}
                    {billingReplacedByOdooPartner && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                            <Receipt size={10} aria-hidden="true" />
                            Marketplace
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Marketplace mode: billing se reemplazará por partner ERP</TooltipContent>
                      </Tooltip>
                    )}
                    {initialDraft.sync_state && initialDraft.sync_state !== "idle" && initialDraft.sync_state !== "draft" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                              initialDraft.sync_state === "sync_failed"
                                ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                                : initialDraft.sync_state === "synced"
                                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                  : "border-white/15 bg-white/[0.06] text-white/70",
                            )}
                          >
                            <RefreshCw size={10} aria-hidden="true" />
                            {initialDraft.sync_state}
                            {initialDraft.odoo_so_name ? ` · ${initialDraft.odoo_so_name}` : ""}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Estado de sincronización con ERP</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </>
              )}

              {/* Center: pager + zoom */}
              {document.signedUrl && (
                <>
                  <div className="mx-1.5 h-5 w-px shrink-0 bg-white/15" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={viewerCurrentPage <= 1}
                        onClick={() => setViewerCurrentPage((c) => Math.max(1, c - 1))}
                        className="inline-flex size-7 items-center justify-center rounded text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
                      >
                        <ChevronLeft size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("viewer.previousPage")}</TooltipContent>
                  </Tooltip>

                  <span className="min-w-[38px] px-0.5 text-center text-[12px] font-semibold text-white tabular-nums select-none">
                    {viewerCurrentPage}
                    <span className="font-normal text-white/45">/{viewerTotalPages}</span>
                  </span>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={viewerCurrentPage >= viewerTotalPages}
                        onClick={() => setViewerCurrentPage((c) => Math.min(viewerTotalPages, c + 1))}
                        className="inline-flex size-7 items-center justify-center rounded text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("viewer.nextPage")}</TooltipContent>
                  </Tooltip>

                  <div className="mx-1 h-5 w-px shrink-0 bg-white/15" />

                  <ZoomPopover
                    zoom={viewerZoom}
                    zoomMode={viewerZoomMode}
                    onZoomChange={setViewerZoom}
                    onZoomModeChange={setViewerZoomMode}
                    dark
                  />

                  <div className="mx-1 h-5 w-px shrink-0 bg-white/15" />

                  {/* Disposición inline: toggle Vertical/Horizontal */}
                  <div className="flex items-center rounded-md border border-white/10 bg-white/[0.04] p-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => { setPageFlow("vertical"); setViewerCurrentPage(1); }}
                          aria-label="Vertical"
                          aria-pressed={pageFlow === "vertical"}
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded transition-all",
                            pageFlow === "vertical"
                              ? "bg-white/15 text-white"
                              : "text-white/55 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <Rows3 size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Disposición vertical</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => { setPageFlow("horizontal"); setViewerCurrentPage(1); }}
                          aria-label="Horizontal"
                          aria-pressed={pageFlow === "horizontal"}
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded transition-all",
                            pageFlow === "horizontal"
                              ? "bg-white/15 text-white"
                              : "text-white/55 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <Columns3 size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Disposición horizontal</TooltipContent>
                    </Tooltip>
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setViewerRotation((((viewerRotation + 90) % 360) as 0 | 90 | 180 | 270))
                        }
                        aria-label="Rotar 90°"
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded transition-all",
                          viewerRotation !== 0
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <RotateCw size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Rotar 90°{viewerRotation !== 0 ? ` (actual ${viewerRotation}°)` : ""}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setViewerZoomMode("fit")}
                        aria-label="Ajustar a página"
                        aria-pressed={viewerZoomMode === "fit"}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded transition-all",
                          viewerZoomMode === "fit"
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Ajustar a página</TooltipContent>
                  </Tooltip>

                  {(viewerTotalPages ?? 1) > 1 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setPagesRailOpen((v) => !v)}
                          aria-label={pagesRailOpen ? "Ocultar miniaturas" : "Mostrar miniaturas"}
                          aria-pressed={pagesRailOpen}
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded transition-all",
                            pagesRailOpen
                              ? "bg-white/10 text-white"
                              : "text-white/60 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <LayoutTemplate size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {pagesRailOpen ? "Ocultar miniaturas" : "Mostrar miniaturas"}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Grupo: resumen extracción (confianza + total + count líneas) */}
                  {(aiConfidence !== null || totalDisplay || lines.length > 0) && (
                    <>
                      <div className="mx-1.5 h-5 w-px shrink-0 bg-white/15" />
                      <div className="flex shrink-0 items-center gap-1">
                        {aiConfidence !== null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                                  aiConfidence >= 0.85
                                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                    : aiConfidence >= 0.6
                                      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                                      : "border-rose-400/30 bg-rose-400/10 text-rose-300",
                                )}
                              >
                                <Sparkles size={11} aria-hidden="true" />
                                {Math.round(aiConfidence * 100)}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Confianza promedio de la extracción IA</TooltipContent>
                          </Tooltip>
                        )}
                        {(totalDisplay || lines.length > 0) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white/85">
                                {totalDisplay && <span>{totalDisplay}</span>}
                                {lines.length > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-white/55">
                                    <Package size={10} aria-hidden="true" />
                                    {lines.length}
                                  </span>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Total {totalDisplay ?? "—"} · {lines.length} {lines.length === 1 ? "línea" : "líneas"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Right: actions */}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {/* View buttons: JSON / Studio / HTML — icon only */}
                <div className="flex items-center gap-0.5 rounded-md border border-white/15 bg-white/[0.06] p-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => setJsonDrawerOpen(true)}
                        className="inline-flex size-7 items-center justify-center rounded text-white/70 transition-all hover:bg-white/10 hover:text-white"
                        aria-label="Ver JSON">
                        <Braces size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Ver extracción JSON</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => setStudioDrawerOpen(true)}
                        className="inline-flex size-7 items-center justify-center rounded text-white/70 transition-all hover:bg-white/10 hover:text-white"
                        aria-label="Abrir Studio">
                        <WandSparkles size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("toolbar.mapStudio")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => setHtmlDrawerOpen(true)}
                        className="inline-flex size-7 items-center justify-center rounded text-white/70 transition-all hover:bg-white/10 hover:text-white"
                        aria-label="Ver HTML">
                        <Globe size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("toolbar.renderedDoc")}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="mx-1 h-5 w-px shrink-0 bg-white/15" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen((v) => !v)}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-md transition-all duration-100",
                        sidebarOpen
                          ? "bg-white/15 text-white"
                          : "text-white/60 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <PanelRight size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{sidebarOpen ? "Ocultar panel" : "Mostrar panel"}</TooltipContent>
                </Tooltip>

                {/* Download original */}
                {document.signedUrl && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={document.signedUrl}
                        download={document.originalName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-8 items-center justify-center rounded-md text-white/60 transition-all hover:bg-white/10 hover:text-white"
                        aria-label="Descargar documento original"
                      >
                        <Download size={14} />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>{t("toolbar.downloadOriginal")}</TooltipContent>
                  </Tooltip>
                )}

                {/* Re-analyze (with confirmation) */}
                {isEditable && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setReanalyzeConfirmOpen(true)}
                        disabled={reanalyzing || saving}
                        className="inline-flex size-8 items-center justify-center rounded-md text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
                      >
                        {reanalyzing ? <ScanEye size={14} className="animate-pulse" /> : <RotateCcw size={14} />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{reanalyzing ? t("reanalyzing") : "Re-analizar con IA"}</TooltipContent>
                  </Tooltip>
                )}

                {presenceUsers.length > 0 && (
                  <div className="mx-0.5 flex items-center -space-x-1.5">
                    {presenceUsers.slice(0, 3).map((u) => (
                      <Tooltip key={u.userId}>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex size-6 shrink-0 items-center justify-center border-2 border-zinc-900 text-[9px] font-semibold text-white transition-transform hover:z-10 hover:scale-110"
                            style={{ backgroundColor: colorForUserId(u.userId), borderRadius: 9999 }}
                          >
                            {presenceInitials(u.name, u.email)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">{u.name || u.email} is viewing</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {presenceUsers.length > 3 && (
                      <span
                        className="inline-flex size-6 shrink-0 items-center justify-center border-2 border-zinc-900 bg-zinc-700 text-[9px] font-semibold text-zinc-300"
                        style={{ borderRadius: 9999 }}
                      >
                        +{presenceUsers.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {isEditable && <div className="mx-1 h-5 w-px shrink-0 bg-white/15" />}

                {isEditable && (
                  <>
                    {/* Semáforo "listo para aprobar" — los mismos checks que el server */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums",
                            readyToApprove
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                          )}
                        >
                          {readyToApprove ? (
                            <CheckCircle2 size={10} aria-hidden="true" />
                          ) : (
                            <AlertCircle size={10} aria-hidden="true" />
                          )}
                          <span className={buyerOk ? "" : "line-through opacity-60"}>buyer</span>
                          <span className={providerOk ? "" : "line-through opacity-60"}>prov</span>
                          <span className={linesOk ? "" : "line-through opacity-60"}>{lines.length}L</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {readyToApprove
                          ? "Listo para aprobar"
                          : `Faltan: ${[
                              buyerOk ? null : "buyer",
                              providerOk ? null : "provider",
                              linesOk ? null : "líneas",
                              missingCount > 0 ? `${missingCount} campos requeridos` : null,
                            ].filter(Boolean).join(", ")}`}
                      </TooltipContent>
                    </Tooltip>

                    {/* Auto-sync ERP: visible para que el operador sepa qué hará Approve */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={toggleAutoSync}
                          aria-pressed={autoSyncOdoo}
                          aria-label={autoSyncOdoo ? "Auto-sync a ERP activo" : "Auto-sync a ERP desactivado"}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                            autoSyncOdoo
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                              : "border-white/15 bg-white/[0.04] text-white/55 hover:bg-white/10",
                          )}
                        >
                          {autoSyncOdoo ? <RefreshCw size={10} /> : <CircleOff size={10} />}
                          Sync
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {autoSyncOdoo
                          ? "Approve pusheará a ERP automáticamente"
                          : "Approve marcará aprobado pero NO pusheará a ERP"}
                      </TooltipContent>
                    </Tooltip>

                    {/* Atajos de teclado */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setKeyboardHelpOpen(true)}
                          aria-label="Atajos de teclado"
                          className="inline-flex size-7 items-center justify-center rounded text-white/55 transition-all hover:bg-white/10 hover:text-white"
                        >
                          <Keyboard size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Atajos de teclado · ?</TooltipContent>
                    </Tooltip>

                    <div className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />

                    <RejectButton draftId={initialDraft.id} />
                    <PushButton
                      draftId={initialDraft.id}
                      beforeApprove={() => saveReview({}, { force: true })}
                    />
                    <ApproveButton
                      draftId={initialDraft.id}
                      missingRequiredLabels={missingRequiredLabels}
                      beforeApprove={() => saveReview({}, { force: true })}
                    />
                  </>
                )}
              </div>
            </div>
          </TooltipProvider>

          {/* ── Canvas row: pages rail + canvas area ─────────────────────── */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Pages Rail — uses viewerTotalPages (updated when PDF loads, more reliable than document.pageCount) */}
            {document.signedUrl && document.mimeType === "application/pdf" && (
              <PagesRail
                url={document.signedUrl}
                pageCount={viewerTotalPages}
                currentPage={viewerCurrentPage}
                onPageChange={setViewerCurrentPage}
                open={pagesRailOpen}
                onOpenChange={setPagesRailOpen}
              />
            )}

            {/* Canvas area */}
            <div
              className={cn(
                "relative min-h-0 flex-1",
                "bg-slate-100 dark:bg-slate-900",
                "bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.06)_0%,transparent_55%),radial-gradient(circle_at_80%_80%,rgba(168,85,247,0.05)_0%,transparent_55%),radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.18)_1px,transparent_0)]",
                "bg-[size:100%_100%,100%_100%,20px_20px]",
              )}
            >
              {/* PDF / Excel / HTML rendered underneath */}
              {document.signedUrl ? (
                (() => {
                  const isExcelFile =
                    document.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                    document.mimeType === "application/vnd.ms-excel" ||
                    document.originalName?.toLowerCase().endsWith(".xlsx") ||
                    document.originalName?.toLowerCase().endsWith(".xls");

                  const isHtmlFile =
                    document.mimeType === "text/html" ||
                    document.originalName?.toLowerCase().endsWith(".html") ||
                    document.originalName?.toLowerCase().endsWith(".htm");

                  return isExcelFile ? (
                    <div className="flex h-full items-center justify-center p-6">
                      <div className="w-full max-w-4xl h-[70vh]">
                        <ExcelViewer url={document.signedUrl} fileName={document.originalName ?? "archivo.xlsx"} />
                      </div>
                    </div>
                  ) : isHtmlFile ? (
                    // Documentos HTML: fetch + doc.write para evitar el problema
                    // de Content-Type incorrecto desde Supabase Storage
                    <HtmlDocViewer url={document.signedUrl} />
                  ) : (
                    <PdfReviewViewer
                      url={document.signedUrl}
                      fileName={document.originalName}
                      mimeType={document.mimeType}
                      pageCount={document.pageCount}
                      highlights={pdfHighlights}
                      labels={{
                        thumbnails: t("viewer.thumbnails"),
                        page: t("viewer.page"),
                        of: t("viewer.of"),
                        loading: t("viewer.loading"),
                        clearSelection: t("viewer.clearSelection"),
                      }}
                      currentPage={viewerCurrentPage}
                      onCurrentPageChange={setViewerCurrentPage}
                      totalPages={viewerTotalPages}
                      onTotalPagesChange={handleTotalPagesChange}
                      zoom={viewerZoom}
                      onZoomChange={setViewerZoom}
                      zoomMode={viewerZoomMode}
                      onZoomModeChange={setViewerZoomMode}
                      pageFlow={pageFlow}
                      rotation={viewerRotation}
                      selectedHighlightId={selectedHighlightId}
                      onSelectHighlight={setSelectedHighlightId}
                    />
                  );
                })()
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--color-fg-mute)]">
                  {t("pdfUnavailable")}
                </div>
              )}

              {/* Reset view button — only visible when something is non-default */}
              {(viewerZoomMode !== "fit" || viewerRotation !== 0 || pageFlow !== "vertical") && (
                <div className="absolute bottom-14 left-1/2 z-20 -translate-x-1/2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewerZoomMode("fit");
                      setViewerRotation(0);
                      setPageFlow("vertical");
                      setViewerCurrentPage(1);
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-mute)] shadow-sm backdrop-blur-md transition-all hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                  >
                    <RefreshCw size={11} />
                    Restablecer vista
                  </button>
                </div>
              )}


              {/* Zoom hint */}
              {true && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
                  <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[color:var(--color-surface)]/85 px-4 py-1.5 text-[11px] text-[var(--color-fg-mute)] shadow-sm backdrop-blur-md">
                    <span className="font-semibold text-[var(--color-fg)] tabular-nums">
                      {Math.round(viewerZoom * 100)}%
                    </span>
                    <span className="opacity-40">·</span>
                    Ctrl + scroll to zoom
                    <span className="opacity-40">·</span>
                    drag to pan
                  </div>
                </div>
              )}

              {reviewIssuesCount > 0 && (
                <div className="pointer-events-none absolute right-4 bottom-4 z-20">
                  <div className="flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/95 px-3 py-1.5 text-[11px] font-medium text-amber-700 shadow-sm backdrop-blur-sm">
                    <TriangleAlert className="size-3" />
                    {reviewIssuesCount} fields flagged for review
                  </div>
                </div>
              )}
            </div>
            {/* end canvas area */}
          </div>
          {/* end canvas row */}
        </section>

        <aside
          className={cn(
            "min-h-0 overflow-hidden bg-background dark:bg-background shadow-[-6px_0_16px_rgba(0,0,0,0.07)] dark:shadow-[-6px_0_16px_rgba(0,0,0,0.5)] transition-all duration-200 ease-out",
            "hidden xl:flex xl:flex-col",
            sidebarOpen ? "xl:w-[520px]" : "xl:w-0",
            mobileTab === "edit" && "!flex !flex-col",
          )}
        >
          <div
            className={cn(
              "flex h-full min-h-0 flex-col",
              !sidebarOpen && "pointer-events-none opacity-0",
            )}
          >
            {/* ── Information Control Center (full) ───────────────────────── */}
            <section className="shrink-0 bg-muted/25 px-3 pt-2.5 pb-2.5">
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_4px_0_rgba(0,0,0,0.07),0_0_0_1px_rgba(0,0,0,0.03)]">

                {/* Zone 0: Identity — customer + doc ID + document state + save */}
                <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <p className="truncate text-[13.5px] font-bold leading-tight tracking-tight text-foreground">
                        {fieldValue(customer) || t("details.title")}
                      </p>
                      <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground/55">
                        #{document.docNumber ?? document.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {/* Show "Ready" when doc is editable + all conditions met; otherwise show real state */}
                      {isEditable && detectedResolved && missingRequiredFields.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                          Ready to approve
                        </span>
                      ) : (
                        <StatusBadge status={document.state as BadgeVariant} label={tStatus(document.state)} />
                      )}
                      <StatusBadge status={initialDraft.sync_state as BadgeVariant} label={tStatus(initialDraft.sync_state)} />
                      {initialDraft.sync_state === "synced" && initialDraft.odoo_so_name && (
                        <a
                          href={`${ERP_BASE_URL}/odoo/sales/${initialDraft.odoo_so_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10.5px] font-medium text-blue-500 hover:underline dark:text-blue-400"
                        >
                          {initialDraft.odoo_so_name}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <SaveState dirty={dirty} saving={saving} />
                  </div>
                </div>

                {/* Zone A: Total + key metrics in one compact row */}
                <div className="flex items-center gap-0 divide-x divide-border/60 border-t border-border/60">
                  {/* Total */}
                  <div className="flex min-w-0 flex-1 flex-col px-4 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/55">Total</span>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-[18px] font-bold leading-none tabular-nums text-foreground">
                        {formatMoney(displayedTotals.total, currency || null, locale)}
                      </span>
                      {currency && (
                        <span className="text-[10px] font-medium text-muted-foreground">{fieldValue(currency)}</span>
                      )}
                    </div>
                  </div>
                  {/* Lines */}
                  <div className="flex shrink-0 flex-col items-center px-3.5 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/55">Lines</span>
                    <span className="mt-0.5 text-[18px] font-bold tabular-nums leading-none text-foreground">{lines.length}</span>
                  </div>
                  {/* AI cost */}
                  {aiCostUsd !== null && (
                    <div className="flex shrink-0 flex-col items-center px-3.5 py-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-violet-500/70">AI</span>
                      <span className="mt-0.5 font-mono text-[12px] font-semibold tabular-nums leading-none text-foreground">
                        {aiCostUsd < 0.01
                          ? `$${aiCostUsd.toFixed(4)}`
                          : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(aiCostUsd)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Zone B: Notification hub — ALL alerts live here, nothing outside */}
                {/* Future alerts: add new <AlertRow> entries in this block only */}
                {(
                  (isEditable && missingRequiredFields.length > 0) ||
                  (isEditable && incompleteLineCount > 0) ||
                  (isEditable && linesHaveNoPrices) ||
                  saveError ||
                  initialDraft.mock
                ) && (
                  <div className="border-t border-border/40">
                    {/* Required fields missing — tab + color derived from field scope */}
                    {isEditable && missingRequiredFields.length > 0 && missingRequiredFields.map((field) => {
                      // Derive tab directly from scope (source of truth)
                      const tabId: ReviewLayoutSectionId =
                        field.scope === "line"                                                    ? "lines"    :
                        field.scope === "shipping" || field.scope === "billing"                  ? "shipping" :
                        field.scope === "notes"                                                  ? "notes"    :
                        field.key === "shipping_address" || field.key === "billing_address"      ? "shipping" :
                        field.key === "note"                                                     ? "notes"    :
                        "header";
                      const tabLabel: Record<ReviewLayoutSectionId, string> = {
                        header: "Header", shipping: "Shipping", lines: "Lines", notes: "Notes",
                      };
                      const tabTone: Record<ReviewLayoutSectionId, "blue" | "green" | "violet" | "amber"> = {
                        header: "blue", shipping: "green", lines: "violet", notes: "amber",
                      };
                      const tabDot: Record<ReviewLayoutSectionId, string> = {
                        header: "bg-blue-500", shipping: "bg-emerald-500", lines: "bg-violet-500", notes: "bg-amber-500",
                      };
                      const tabBadge: Record<ReviewLayoutSectionId, string> = {
                        header:   "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
                        shipping: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        lines:    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
                        notes:    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      };
                      const label = targetFieldLabel(field);
                      return (
                        <AlertRow key={field.key} tone={tabTone[tabId]}>
                          <span className={cn("size-1.5 shrink-0 rounded-full", tabDot[tabId])} />
                          <span className="flex-1">
                            <span className="font-semibold">{label}</span>
                            <span className="opacity-70"> is required</span>
                          </span>
                          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide", tabBadge[tabId])}>
                            {tabLabel[tabId]}
                          </span>
                        </AlertRow>
                      );
                    })}
                    {/* Line items with pending required fields — violet = Lines tab */}
                    {isEditable && incompleteLineCount > 0 && (
                      <AlertRow tone="violet">
                        <span className="size-1.5 shrink-0 rounded-full bg-violet-500" />
                        <span className="flex-1">{t("lines.incomplete", { count: incompleteLineCount })}</span>
                        <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                          Lines
                        </span>
                      </AlertRow>
                    )}
                    {/* Auto-sync skipped: line items have no prices ($0) */}
                    {isEditable && linesHaveNoPrices && (
                      <AlertRow tone="amber">
                        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span className="flex-1">
                          <span className="font-semibold">Auto-sync no aplicado:</span>
                          <span className="opacity-80"> las líneas no tienen precio. Captura los precios antes de aprobar.</span>
                        </span>
                        <span className="shrink-0 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                          Lines
                        </span>
                      </AlertRow>
                    )}
                    {/* Save error with retry */}
                    {saveError && (
                      <AlertRow tone="red">
                        <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                        <span className="flex-1">{t("details.saveError")}</span>
                        {isEditable && (
                          <Button type="button" size="xs" variant="ghost"
                            onClick={() => void saveReview({}, { force: true })}
                            disabled={saving}
                            className="h-5 shrink-0 px-1.5 text-[10px] text-destructive hover:text-destructive"
                          >
                            {tCommon("retry")}
                          </Button>
                        )}
                      </AlertRow>
                    )}
                    {/* Mock mode */}
                    {initialDraft.mock && (
                      <AlertRow tone="blue">
                        <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
                        {t("mockBanner")}
                      </AlertRow>
                    )}
                  </div>
                )}

                {/* Zone PS: Packing Slip — muestra qué archivos irán a COF en ERP */}
                {packingSlipDocs.length > 0 && (
                  <div className="border-t border-emerald-500/20 bg-emerald-500/4">
                    <div className="px-4 py-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                          Packing Slip → ERP COF
                        </span>
                        <span className="ml-auto rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {packingSlipDocs.length}
                        </span>
                      </div>
                      <p className="mb-2 text-[10px] text-emerald-700/70 dark:text-emerald-400/70 leading-tight">
                        Se adjuntará automáticamente al SO en{" "}
                        <code className="font-mono">csf_packing_list_attachment_id</code> al aprobar.
                      </p>
                      <div className="space-y-1.5">
                        {packingSlipDocs.map((ps) => (
                          <div key={ps.id} className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-white/60 px-2.5 py-1.5 dark:bg-emerald-950/30">
                            <svg className="shrink-0 text-emerald-600" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                              {ps.name}
                            </span>
                            <span className="shrink-0 text-[10px] text-emerald-600/60">
                              {ps.sizeBytes < 1024 ? `${ps.sizeBytes}B` : ps.sizeBytes < 1048576 ? `${Math.round(ps.sizeBytes / 1024)}KB` : `${(ps.sizeBytes / 1048576).toFixed(1)}MB`}
                            </span>
                            {ps.signedUrl && (
                              <a
                                href={ps.signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-[10px] font-medium text-emerald-600 hover:underline"
                                title="Ver packing slip"
                              >
                                ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Zone C: Partner — compact */}
                <div className={cn(
                  "border-t transition-colors",
                  hasResellerMapping ? "border-border/50" : "border-amber-500/20",
                )}>
                  <div className={cn("flex items-stretch", !hasResellerMapping && "bg-amber-500/4")}>
                    <button
                      type="button"
                      onClick={openResellerDialog}
                      className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <Building2
                        size={13}
                        className={cn(
                          "shrink-0",
                          hasResellerMapping ? "text-muted-foreground" : "text-amber-500",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <span className={cn(
                          "truncate text-[12px] font-semibold leading-tight",
                          hasResellerMapping ? "text-foreground" : "text-amber-700 dark:text-amber-300",
                        )}>
                          {mappedPartnerName || providerDisplayName}
                        </span>
                      </div>
                      {resolutionLoading
                        ? <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        : hasResellerMapping
                          ? <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                          : <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                      }
                    </button>
                    {document.providerId && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/templates/${document.providerId}/configuration`}
                            target="_blank"
                            className="flex shrink-0 items-center justify-center border-l border-border/50 px-3 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Open partner template"
                          >
                            <ExternalLink size={11} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="left">{t("toolbar.openPartnerTemplate")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
              {/* ── / Information Control Center ─────────────────────────────── */}
              {/* All alerts are inside the control center. Do NOT add alerts outside. */}
            </section>

            <Tabs
              key={`${defaultReviewTab}:${visibleSections.map((section) => section.id).join("|")}`}
              defaultValue={defaultReviewTab}
              onValueChange={(v) => setActiveTab(v as ReviewLayoutSectionId)}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {/* Tab list — underline accent style with icon badges */}
              <div className="shrink-0 bg-background">
                <TabsList className="flex h-auto w-full justify-stretch gap-0 rounded-none bg-transparent p-0">
                  {visibleSections.map((section) => {
                    const Icon =
                      section.id === "header"
                        ? ReceiptText
                        : section.id === "shipping"
                          ? Truck
                          : section.id === "lines"
                            ? LayoutList
                            : NotebookText;
                    type TabAccent = { text: string; bg: string; bar: string; dot: string };
                    const accentMap: Record<string, TabAccent> = {
                      header:   { text: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/6",    bar: "bg-blue-500",    dot: "bg-blue-500" },
                      shipping: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/6", bar: "bg-emerald-500", dot: "bg-emerald-500" },
                      lines:    { text: "text-violet-600 dark:text-violet-400",   bg: "bg-violet-500/6",  bar: "bg-violet-500",  dot: "bg-violet-500" },
                      notes:    { text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/6",   bar: "bg-amber-500",   dot: "bg-amber-500" },
                    };
                    const accent: TabAccent = accentMap[section.id] ?? { text: "text-foreground", bg: "bg-muted/30", bar: "bg-foreground", dot: "bg-foreground" };

                    return (
                      <TabsTrigger
                        key={section.id}
                        value={section.id}
                        className={cn(
                          "group relative flex flex-1 items-center justify-center gap-2 rounded-none border-0 border-none outline-none bg-transparent px-3 py-[18px] transition-colors duration-150 [border:none!important]",
                          // inactive: muted; hover only on inactive (data-[state=inactive])
                          "text-muted-foreground/55",
                          "data-[state=inactive]:hover:text-foreground/80 data-[state=inactive]:hover:bg-muted/15",
                          // active: colored, no hover reaction
                          "data-active:" + accent.text,
                          "data-active:" + accent.bg,
                        )}
                      >
                        <Icon
                          size={15}
                          strokeWidth={1.8}
                          className={cn(
                            "shrink-0 transition-colors duration-150",
                            "text-muted-foreground/50 group-data-active:" + accent.text,
                          )}
                          aria-hidden="true"
                        />
                        <span className="text-[13px] font-semibold leading-none tracking-tight">
                          {section.label}
                        </span>
                        {section.id === "lines" && incompleteLineCount > 0 && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[9px] font-bold text-white">
                            {incompleteLineCount}
                          </span>
                        )}
                        {/* Laser bar — shoots from left on hover of INACTIVE tabs only */}
                        <span
                          className={cn(
                            "absolute inset-x-0 -bottom-px h-[2.5px] origin-left",
                            "scale-x-0 opacity-0",
                            // inactive hover: laser shoot
                            "group-data-[state=inactive]:group-hover:scale-x-100",
                            "group-data-[state=inactive]:group-hover:opacity-100",
                            "group-data-[state=inactive]:group-hover:transition-[transform,opacity]",
                            "group-data-[state=inactive]:group-hover:[transition-duration:90ms]",
                            "group-data-[state=inactive]:group-hover:[transition-timing-function:cubic-bezier(0.15,0,0,1)]",
                            // active: always visible, no transition
                            "group-data-active:scale-x-100 group-data-active:opacity-100 group-data-active:transition-none",
                            accent.bar,
                          )}
                          aria-hidden="true"
                        />
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {visibleSections.some((section) => section.id === "header") && (
                <TabsContent value="header" className="min-h-0 overflow-y-auto p-3">
                  <section className="space-y-3">
                    <div className="flex items-center justify-end gap-3">
                      {isEditable && dirty && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => void saveReview({}, { force: true })}
                          disabled={saving}
                        >
                          {tCommon("save")}
                        </Button>
                      )}
                    </div>
                    {orderedHeaderTopKeys.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {orderedHeaderTopKeys.map((key) => {
                          if (key === "client_order_ref") {
                            return (
                              <StudioSelectable
                                key={key}
                                enabled={studioMode}
                                active={selectedStudioTarget?.key === "client_order_ref"}
                                mapped={annotationByTarget.has("client_order_ref")}
                                onSelect={() => selectStudioTarget("client_order_ref")}
                              >
                                <EditableField
                                  label={t("fields.poNumber")}
                                  required={requiredKeys.has("client_order_ref")}
                                  invalid={missingRequiredKeys.has("client_order_ref")}
                                  hint={
                                    missingRequiredKeys.has("client_order_ref")
                                      ? t("required.missingField", { field: t("fields.poNumber") })
                                      : undefined
                                  }
                                  value={poNumber}
                                  disabled={!isEditable}
                                  onBlur={() => void saveReview()}
                                  onChange={(value) => {
                                    setPoNumber(value);
                                    markDirty();
                                  }}
                                />
                              </StudioSelectable>
                            );
                          }
                          if (key === "date_order") {
                            return (
                              <>
                              <StudioSelectable
                                key={key}
                                enabled={studioMode}
                                active={selectedStudioTarget?.key === "date_order"}
                                mapped={annotationByTarget.has("date_order")}
                                onSelect={() => selectStudioTarget("date_order")}
                              >
                                <EditableField
                                  label={t("fields.poDate")}
                                  required={requiredKeys.has("date_order")}
                                  invalid={missingRequiredKeys.has("date_order")}
                                  hint={
                                    missingRequiredKeys.has("date_order")
                                      ? t("required.missingField", { field: t("fields.poDate") })
                                      : undefined
                                  }
                                  type="date"
                                  value={poDate}
                                  disabled={!isEditable}
                                  onBlur={() => void saveReview()}
                                  onChange={(value) => {
                                    setPoDate(value);
                                    markDirty();
                                  }}
                                />
                              </StudioSelectable>
                              <StudioSelectable
                                key="delivery_date"
                                enabled={studioMode}
                                active={selectedStudioTarget?.key === "commitment_date"}
                                mapped={annotationByTarget.has("commitment_date")}
                                onSelect={() => selectStudioTarget("commitment_date")}
                              >
                                <EditableField
                                  label={t("fields.deliveryDate")}
                                  required={requiredKeys.has("commitment_date")}
                                  invalid={missingRequiredKeys.has("commitment_date")}
                                  type="date"
                                  value={deliveryDate}
                                  disabled={!isEditable}
                                  onBlur={() => void saveReview()}
                                  onChange={(value) => {
                                    setDeliveryDate(value);
                                    markDirty();
                                  }}
                                />
                              </StudioSelectable>
                              </>
                            );
                          }
                          return (
                            <StudioSelectable
                              key={key}
                              enabled={studioMode}
                              active={selectedStudioTarget?.key === "currency_id"}
                              mapped={annotationByTarget.has("currency_id")}
                              onSelect={() => selectStudioTarget("currency_id")}
                            >
                              <EditableField
                                label={t("fields.currency")}
                                required={requiredKeys.has("currency_id")}
                                invalid={missingRequiredKeys.has("currency_id")}
                                hint={
                                  missingRequiredKeys.has("currency_id")
                                    ? t("required.missingField", { field: t("fields.currency") })
                                    : undefined
                                }
                                value={currency}
                                maxLength={3}
                                disabled={!isEditable}
                                onBlur={() => void saveReview()}
                                onChange={(value) => {
                                  setCurrency(value.toUpperCase());
                                  markDirty();
                                }}
                              />
                            </StudioSelectable>
                          );
                        })}
                        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-2.5 py-2">
                          <p className="text-xs text-[var(--color-fg-mute)]">{t("lines.title")}</p>
                          <p className="mt-1 font-mono text-sm text-[var(--color-fg)]">
                            {t("lines.count", { count: lines.length })}
                          </p>
                        </div>
                      </div>
                    )}
                    <StudioSelectable
                      enabled={studioMode}
                      active={selectedStudioTarget?.key === "payment_terms"}
                      mapped={annotationByTarget.has("payment_terms")}
                      onSelect={() => selectStudioTarget("payment_terms")}
                    >
                      <div className="grid gap-1.5">
                        <span className="text-xs font-medium text-[var(--color-fg)]">
                          {t("fields.paymentTerms")}
                        </span>
                        <input
                          className={inputCls}
                          placeholder={t("fields.paymentTermsPlaceholder")}
                          value={paymentTerms}
                          disabled={!isEditable}
                          onBlur={() => void saveReview()}
                          onChange={(e) => {
                            setPaymentTerms(e.target.value);
                            markDirty();
                          }}
                        />
                      </div>
                    </StudioSelectable>
                    {orderedHeaderBottomKeys.map((key) =>
                      key === "partner_id" ? (
                        <StudioSelectable
                          key={key}
                          enabled={studioMode}
                          active={selectedStudioTarget?.key === "partner_id"}
                          mapped={annotationByTarget.has("partner_id")}
                          onSelect={() => selectStudioTarget("partner_id")}
                        >
                          <div className="grid gap-2">
                            <EditableField
                              label={t("fields.customer")}
                              required={requiredKeys.has("partner_id")}
                              invalid={missingRequiredKeys.has("partner_id")}
                              hint={
                                missingRequiredKeys.has("partner_id")
                                  ? t("required.missingField", { field: t("fields.customer") })
                                  : undefined
                              }
                              value={customer}
                              disabled={!isEditable}
                              onBlur={() => void saveReview()}
                              onChange={(value) => {
                                setCustomer(value);
                                markDirty();
                              }}
                            />
                            <EditableField
                              label={t("fields.contactPerson")}
                              value={customerContactPerson}
                              disabled={!isEditable}
                              onBlur={() => void saveReview()}
                              onChange={(value) => {
                                setCustomerContactPerson(value);
                                markDirty();
                              }}
                            />
                          </div>
                        </StudioSelectable>
                      ) : (
                        <StudioSelectable
                          key={key}
                          enabled={studioMode}
                          active={selectedStudioTarget?.key === "customer_address"}
                          mapped={annotationByTarget.has("customer_address")}
                          onSelect={() => selectStudioTarget("customer_address")}
                        >
                          <EditableTextAreaField
                            label={t("fields.customerAddress")}
                            required={requiredKeys.has("customer_address")}
                            invalid={missingRequiredKeys.has("customer_address")}
                            hint={
                              missingRequiredKeys.has("customer_address")
                                ? t("required.missingField", { field: t("fields.customerAddress") })
                                : t("details.customerAddressHint")
                            }
                            value={customerAddress}
                            disabled={!isEditable}
                            onBlur={() => void saveReview()}
                            onChange={(value) => {
                              setCustomerAddress(value);
                              markDirty();
                            }}
                          />
                        </StudioSelectable>
                      ),
                    )}
                    {!showHeaderPoNumber &&
                      !showHeaderPoDate &&
                      !showHeaderCurrency &&
                      !showHeaderCustomer &&
                      !showHeaderCustomerAddress && (
                        <p className="text-xs text-[var(--color-fg-mute)]">{t("layoutEmpty")}</p>
                      )}
                  </section>
                </TabsContent>
              )}

              {visibleSections.some((section) => section.id === "shipping") && (
                <TabsContent value="shipping" className="min-h-0 overflow-y-auto p-3">
                  <section className="space-y-5">
                    {orderedShippingKeys.map((key) =>
                      key === "shipping_address" ? (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <MapPin size={13} />
                            </span>
                            <span className="text-[12px] font-semibold text-foreground">{t("fields.deliveryAddress")}</span>
                          </div>
                          <StudioSelectable
                            enabled={studioMode}
                            active={selectedStudioTarget?.key === "shipping_address"}
                            mapped={annotationByTarget.has("shipping_address")}
                            onSelect={() => selectStudioTarget("shipping_address")}
                          >
                            <AddressFieldGroup
                              label=""
                              value={deliveryAddress}
                              disabled={!isEditable}
                              singleContact
                              onBlur={() => void saveReview()}
                              onChange={(value) => {
                                setDeliveryAddress(value);
                                markDirty();
                              }}
                            />
                          </StudioSelectable>
                        </div>
                      ) : (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                              <Building2 size={13} />
                            </span>
                            <span className="text-[12px] font-semibold text-foreground">{t("fields.billingAddress")}</span>
                            {billingReplacedByOdooPartner && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                                title="Marketplace mode: este billing se reemplazará por la dirección del partner ERP al sincronizar"
                              >
                                <Receipt size={10} aria-hidden="true" />
                                Marketplace
                              </span>
                            )}
                          </div>
                          {billingReplacedByOdooPartner && (
                            <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                              <Info size={13} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
                              <span>
                                <strong className="font-semibold">Marketplace mode activo.</strong>{" "}
                                Al aprobar, este billing se reemplazará por la dirección del partner
                                ERP del provider. La extracción IA queda en el draft para auditoría
                                pero no se enviará a ERP.
                              </span>
                            </div>
                          )}
                          <StudioSelectable
                            enabled={studioMode}
                            active={selectedStudioTarget?.key === "billing_address"}
                            mapped={annotationByTarget.has("billing_address")}
                            onSelect={() => selectStudioTarget("billing_address")}
                          >
                            <AddressFieldGroup
                              label=""
                              value={billingAddress}
                              disabled={!isEditable}
                              singleContact
                              onBlur={() => void saveReview()}
                              onChange={(value) => {
                                setBillingAddress(value);
                                markDirty();
                              }}
                            />
                          </StudioSelectable>
                        </div>
                      ),
                    )}
                    {!showShippingDelivery && !showShippingBilling && (
                      <p className="text-xs text-[var(--color-fg-mute)]">{t("layoutEmpty")}</p>
                    )}
                  </section>
                </TabsContent>
              )}

              {visibleSections.some((section) => section.id === "lines") && (
                <TabsContent value="lines" className="min-h-0 overflow-y-auto p-3">
                  <section className="space-y-2.5">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-foreground">{t("lines.title")}</span>
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] font-semibold text-muted-foreground">
                          {lines.length}
                        </span>
                      </div>
                      {isEditable && (
                        <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-7 text-[11px]">
                          <Plus size={11} aria-hidden="true" />
                          {t("lines.addLine")}
                        </Button>
                      )}
                    </div>

                    {lines.length > 0 ? (
                      <Accordion
                        type="single"
                        collapsible
                        value={openLine}
                        onValueChange={setOpenLine}
                        className="gap-1.5"
                      >
                        {lines.map((line, index) => {
                          const lineMissingRequired = requiredLineFields.filter(
                            (field) => !lineHasReviewValue(line, field.key),
                          );
                          const lineMissingLabels = lineMissingRequired.map((field) =>
                            targetFieldLabel(field),
                          );
                          const lineHasRequiredMisses = lineMissingRequired.length > 0;
                          const descriptionMissing =
                            (requiredKeys.has("name") && !lineHasReviewValue(line, "name")) ||
                            (requiredKeys.has("product_id") &&
                              !lineHasReviewValue(line, "product_id"));
                          const canRemoveLine = isEditable && lines.length > 1;
                          const resolvedLineProduct = resolvedProductForLine(line);
                          const isOpen = openLine === line.clientId;

                          return (
                            <AccordionItem
                              key={line.clientId}
                              value={line.clientId}
                              className={cn(
                                "overflow-hidden rounded-md border bg-card transition-colors",
                                lineHasRequiredMisses
                                  ? "border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/10"
                                  : isOpen
                                    ? "border-primary/30 bg-background"
                                    : "border-border hover:border-border/80",
                              )}
                            >
                              <AccordionTrigger className="group px-3 py-2.5 hover:no-underline hover:bg-muted/40 transition-colors [&>svg]:text-muted-foreground">
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {/* Line number badge */}
                                    <span className={cn(
                                      "shrink-0 inline-flex size-5 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                                      lineHasRequiredMisses
                                        ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
                                        : "bg-muted text-muted-foreground",
                                    )}>
                                      {index + 1}
                                    </span>
                                    <span className={cn(
                                      "truncate text-[13px] font-medium",
                                      lineHasRequiredMisses
                                        ? "text-amber-700 dark:text-amber-300"
                                        : "text-foreground",
                                    )}>
                                      {line.description || t("lines.descriptionRequired")}
                                    </span>
                                    {line.kind && line.kind !== "item" && (
                                      <span
                                        className={cn(
                                          "shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                          line.kind === "discount"
                                            ? "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300"
                                            : line.kind === "freight"
                                              ? "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-300"
                                              : line.kind === "surcharge"
                                                ? "border-violet-400/30 bg-violet-400/10 text-violet-700 dark:text-violet-300"
                                                : "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-300",
                                        )}
                                        title={`Tipo de línea: ${line.kind}`}
                                      >
                                        {line.kind}
                                      </span>
                                    )}
                                    {lineHasRequiredMisses && (
                                      <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                        {t("required.requiredShort")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-3">
                                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                                      {fieldValue(line.sku) && (
                                        <span className="font-mono">{fieldValue(line.sku)}</span>
                                      )}
                                      {line.customer_sku && line.customer_sku.trim() && line.customer_sku.trim() !== line.sku.trim() && (
                                        <span className="ml-1 opacity-60">
                                          → <span className="font-mono">{line.customer_sku.trim()}</span>
                                        </span>
                                      )}
                                      {fieldValue(line.sku) && " · "}
                                      {fieldValue(line.quantity)} × {formatMoney(numeric(line.unit_price), currency || null, locale)}
                                    </span>
                                    <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground">
                                      {formatMoney(lineTotal(line), currency || null, locale)}
                                    </span>
                                  </div>
                                </div>
                              </AccordionTrigger>

                              <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-3 pt-3">
                                <div className="grid gap-3">
                                  {lineHasRequiredMisses && (
                                    <div className="flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                                      <span className="mt-0.5 shrink-0">⚠</span>
                                      {t("required.missingInline", { fields: joinLabels(lineMissingLabels) })}
                                    </div>
                                  )}
                                  <div className="grid grid-cols-2 gap-3">
                                    {[...orderedLineKeys, "unit"].map((key) => {
                                      if (key === "name") {
                                        return (
                                          <div key={key} className="col-span-2">
                                            <LabeledLineInput
                                              label={t("lines.description")}
                                              value={line.description}
                                              disabled={!isEditable}
                                              invalid={descriptionMissing}
                                              required={
                                                requiredKeys.has("name") ||
                                                requiredKeys.has("product_id")
                                              }
                                              onBlur={() => void saveReview()}
                                              onChange={(value) =>
                                                updateLine(line.clientId, { description: value })
                                              }
                                            />
                                          </div>
                                        );
                                      }
                                      if (key === "product_id") {
                                        // Determine match quality for the status icon
                                        const lineSuggestions = line.sku.trim()
                                          ? buildSkuSuggestions(line.sku, line.description)
                                          : [];
                                        const hasAnySuggestion = lineSuggestions.length > 0;
                                        const skuEmpty = !line.sku.trim();

                                        return (
                                          <div key={key} className="col-span-2 grid gap-1">
                                            <FieldLabel
                                              label={t("lines.sku")}
                                              required={requiredKeys.has("product_id")}
                                            />
                                            {/* SKU input + status icon side by side */}
                                            <div className="flex items-center gap-1.5">
                                              <div className="min-w-0 flex-1">
                                                <LineInput
                                                  value={line.sku}
                                                  disabled={!isEditable}
                                                  invalid={
                                                    requiredKeys.has("product_id") &&
                                                    !lineHasReviewValue(line, "product_id")
                                                  }
                                                  onBlur={() => handleSkuBlur(line.clientId)}
                                                  onChange={(value) =>
                                                    updateLine(line.clientId, {
                                                      sku: value,
                                                      odoo_product_id: null,
                                                    })
                                                  }
                                                />
                                              </div>
                                              {/* Status icon — only when SKU is non-empty */}
                                              {!skuEmpty && (
                                                <button
                                                  type="button"
                                                  title={
                                                    resolvedLineProduct
                                                      ? `${resolvedLineProduct.name} — click to change`
                                                      : hasAnySuggestion
                                                        ? "Possible matches found — click to resolve"
                                                        : "No match found — click to search"
                                                  }
                                                  onClick={() => {
                                                    setSkuQuickSearch("");
                                                    setSkuQuickDialog({
                                                      lineId: line.clientId,
                                                      sku: line.sku,
                                                      description: line.description,
                                                    });
                                                  }}
                                                  className={cn(
                                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                                                    resolvedLineProduct
                                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                                                      : hasAnySuggestion
                                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                                                        : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
                                                  )}
                                                >
                                                  {resolvedLineProduct ? (
                                                    <PackageCheck size={14} />
                                                  ) : (
                                                    <PackageSearch size={14} />
                                                  )}
                                                </button>
                                              )}
                                            </div>
                                            {/* Match feedback + Partner SKU agrupados en una sola card
                                                compacta. Antes vivían como dos bloques separados con un gap
                                                que rompía la lectura — ahora forman un bloque visual único
                                                debajo del input. */}
                                            {(resolvedLineProduct || !skuEmpty || line.customer_sku) && (
                                              <div
                                                className={cn(
                                                  "rounded-md border px-2 py-1.5 text-[11px]",
                                                  resolvedLineProduct
                                                    ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                                                    : !skuEmpty && hasAnySuggestion
                                                      ? "border-amber-500/25 bg-amber-500/[0.05]"
                                                      : !skuEmpty
                                                        ? "border-destructive/25 bg-destructive/[0.05]"
                                                        : "border-border/60 bg-muted/30",
                                                )}
                                              >
                                                {resolvedLineProduct && (
                                                  <p className="truncate text-emerald-700 dark:text-emerald-300">
                                                    <span className="font-semibold">✓</span>{" "}
                                                    {resolvedLineProduct.name}
                                                    {resolvedLineProduct.default_code && (
                                                      <span className="ml-1 font-mono text-emerald-700/65 dark:text-emerald-300/60">
                                                        ({resolvedLineProduct.default_code})
                                                      </span>
                                                    )}
                                                  </p>
                                                )}
                                                {!resolvedLineProduct && !skuEmpty && hasAnySuggestion && (
                                                  <p className="text-amber-700 dark:text-amber-300">
                                                    ⚠ Posibles coincidencias — clic en el icono para resolver
                                                  </p>
                                                )}
                                                {!resolvedLineProduct && !skuEmpty && !hasAnySuggestion && (
                                                  <p className="text-destructive">
                                                    Sin match en el catálogo ERP — clic en el icono para buscar
                                                  </p>
                                                )}
                                                {/* Partner SKU inline: label en gris + input minimalista,
                                                    misma línea, sin pl-3 ni iconos extra. Solo se renderiza
                                                    visible si hay valor o si el campo está habilitado. */}
                                                {(line.customer_sku || isEditable) && (
                                                  <div
                                                    className={cn(
                                                      "flex items-center gap-1.5 font-mono",
                                                      resolvedLineProduct || (!skuEmpty && hasAnySuggestion) || (!skuEmpty && !hasAnySuggestion)
                                                        ? "mt-1 border-t border-current/10 pt-1"
                                                        : "",
                                                    )}
                                                  >
                                                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                                      Partner
                                                    </span>
                                                    <input
                                                      type="text"
                                                      value={line.customer_sku}
                                                      disabled={!isEditable}
                                                      placeholder="—"
                                                      autoComplete="off"
                                                      onBlur={() => void saveReview()}
                                                      onChange={(event) =>
                                                        updateLine(line.clientId, {
                                                          customer_sku: event.target.value,
                                                        })
                                                      }
                                                      className={cn(
                                                        "h-5 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-[11px] text-muted-foreground",
                                                        "placeholder:text-muted-foreground/40",
                                                        "hover:border-border/60 focus:border-border focus:bg-background focus:text-foreground focus:outline-none",
                                                        "disabled:cursor-not-allowed disabled:opacity-50",
                                                      )}
                                                      title="Partner-recognized SKU (e.g. Retailer C Buyer's Part Number). Shown on the packing slip when set."
                                                    />
                                                    {line.customer_sku &&
                                                      line.sku &&
                                                      line.customer_sku.trim() === line.sku.trim() && (
                                                        <Tooltip>
                                                          <TooltipTrigger asChild>
                                                            <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                                              ≡
                                                            </span>
                                                          </TooltipTrigger>
                                                          <TooltipContent>
                                                            Igual al SKU interno — el packing slip mostrará este código de cualquier modo.
                                                          </TooltipContent>
                                                        </Tooltip>
                                                      )}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                      if (key === "product_uom_qty") {
                                        return (
                                          <LabeledLineInput
                                            key={key}
                                            label={t("lines.qty")}
                                            type="number"
                                            value={line.quantity}
                                            disabled={!isEditable}
                                            invalid={
                                              requiredKeys.has("product_uom_qty") &&
                                              !lineHasReviewValue(line, "product_uom_qty")
                                            }
                                            required={requiredKeys.has("product_uom_qty")}
                                            onBlur={() => void saveReview()}
                                            onChange={(value) =>
                                              updateLine(line.clientId, { quantity: value })
                                            }
                                          />
                                        );
                                      }
                                      if (key === "price_unit") {
                                        return (
                                          <LabeledLineInput
                                            key={key}
                                            label={t("lines.unitPrice")}
                                            type="number"
                                            value={line.unit_price}
                                            disabled={!isEditable}
                                            invalid={
                                              requiredKeys.has("price_unit") &&
                                              !lineHasReviewValue(line, "price_unit")
                                            }
                                            required={requiredKeys.has("price_unit")}
                                            onBlur={() => void saveReview()}
                                            onChange={(value) =>
                                              updateLine(line.clientId, { unit_price: value })
                                            }
                                          />
                                        );
                                      }
                                      if (key === "tax_id") {
                                        return (
                                          <LabeledLineInput
                                            key={key}
                                            label={t("lines.taxRate")}
                                            type="number"
                                            value={line.tax_rate}
                                            disabled={!isEditable}
                                            invalid={
                                              requiredKeys.has("tax_id") &&
                                              !lineHasReviewValue(line, "tax_id")
                                            }
                                            required={requiredKeys.has("tax_id")}
                                            onBlur={() => void saveReview()}
                                            onChange={(value) =>
                                              updateLine(line.clientId, { tax_rate: value })
                                            }
                                          />
                                        );
                                      }
                                      return (
                                        <LabeledLineInput
                                          key={key}
                                          label={t("lines.unit")}
                                          value={line.unit}
                                          disabled={!isEditable}
                                          onBlur={() => void saveReview()}
                                          onChange={(value) =>
                                            updateLine(line.clientId, { unit: value })
                                          }
                                        />
                                      );
                                    })}
                                  </div>
                                  {/* Line footer: total + remove */}
                                  <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-muted-foreground">{t("lines.total")}</span>
                                      <span className="font-mono text-[14px] font-bold tabular-nums text-foreground">
                                        {formatMoney(lineTotal(line), currency || null, locale)}
                                      </span>
                                    </div>
                                    {isEditable && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={!canRemoveLine}
                                        onClick={() => removeLine(line.clientId)}
                                        aria-label={t("lines.removeLine")}
                                        className="h-7 gap-1.5 text-[11px] text-muted-foreground/60 hover:bg-destructive/8 hover:text-destructive"
                                      >
                                        <Trash2 size={12} aria-hidden="true" />
                                        {t("lines.removeLine")}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    ) : (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center">
                        <p className="text-sm font-medium text-[var(--color-fg)]">
                          {t("lines.emptyTitle")}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-fg-mute)]">
                          {t("lines.emptySubtitle")}
                        </p>
                        {isEditable && (
                          <Button type="button" size="sm" onClick={addLine} className="mt-3">
                            <Plus size={12} aria-hidden="true" />
                            {t("lines.addLine")}
                          </Button>
                        )}
                      </div>
                    )}
                  </section>
                </TabsContent>
              )}

              {visibleSections.some((section) => section.id === "notes") && (
                <TabsContent value="notes" className="min-h-0 overflow-y-auto p-3">
                  <section className="space-y-3">
                    <p className="text-xs text-[var(--color-fg-mute)]">{t("details.notesHint")}</p>
                    {showNotesField ? (
                      <StudioSelectable
                        enabled={studioMode}
                        active={selectedStudioTarget?.key === "note"}
                        mapped={annotationByTarget.has("note")}
                        onSelect={() => selectStudioTarget("note")}
                      >
                        <Textarea
                          value={notes}
                          disabled={!isEditable}
                          onBlur={() => void saveReview()}
                          onChange={(event) => {
                            setNotes(event.target.value);
                            markDirty();
                          }}
                          className={cn(inputClassName, "min-h-40 resize-y py-2")}
                        />
                      </StudioSelectable>
                    ) : (
                      <p className="text-xs text-[var(--color-fg-mute)]">{t("layoutEmpty")}</p>
                    )}
                  </section>
                </TabsContent>
              )}
            </Tabs>

            {/* ── Order summary footer with active-tab gradient ── */}
            <section className="shrink-0 bg-muted/60 dark:bg-muted/40">
              {/* Subtle top separator */}
              <div className="h-px w-full bg-border/40" />

              {/* Subtotal + Tax — compact */}
              <div className="space-y-1 px-4 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted-foreground">{t("fields.subtotal")}</span>
                  <span className="font-mono text-[12px] tabular-nums text-foreground">
                    {formatMoney(displayedTotals.subtotal, currency || null, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted-foreground">{t("fields.tax")}</span>
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                    {formatMoney(displayedTotals.taxTotal, currency || null, locale)}
                  </span>
                </div>
              </div>

              {/* Total — prominent */}
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                  {t("fields.total")}
                </span>
                <span className="font-mono text-[20px] font-bold tabular-nums leading-none text-foreground">
                  {formatMoney(displayedTotals.total, currency || null, locale)}
                </span>
              </div>
            </section>
          </div>
        </aside>

        {/* Desktop collapsed rail for quick reopen */}
        {!sidebarOpen && (
          <div className="hidden w-10 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-bg)] xl:flex">
            <div className="flex w-full flex-col items-center py-2">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-fg-mute)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                      aria-label="Mostrar panel"
                    >
                      <PanelRight size={14} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Mostrar panel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        <Dialog
          open={resellerDialogOpen}
          onOpenChange={(open) => {
            setResellerDialogOpen(open);
            if (!open) {
              setSelectedResellerId(providerResolution?.reseller_mapping?.odoo_partner_id ?? null);
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Partner de ERP</DialogTitle>
              <DialogDescription>
                Busca el partner correcto en ERP y confirma el cambio para este provider.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[var(--color-fg-mute)]" />
                <Input
                  value={resellerQuery}
                  autoFocus
                  onChange={(event) => {
                    setResellerQuery(event.target.value);
                    setSelectedResellerId(null);
                  }}
                  placeholder={t("template.searchPlaceholder")}
                  className="h-10 pr-3 pl-9 text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-fg-mute)]">
                {resellerQuery.trim().length < 2
                  ? t("template.searchHint")
                  : selectedResellerId
                    ? t("template.partnerSelected")
                    : t("template.predictiveHint")}
              </p>
              <div className="max-h-80 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5">
                {resolutionLoading ? (
                  <div className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-xs text-[var(--color-fg-mute)]">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("template.searching")}
                  </div>
                ) : resellerCandidates.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--color-fg-mute)]">
                    {t("template.noResults")}
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {resellerCandidates
                      .filter((candidate) => candidate.name?.trim())
                      .map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => {
                            setSelectedResellerId(candidate.id);
                            setResellerQuery(candidate.name);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-xs transition-colors",
                            selectedResellerId === candidate.id
                              ? "border-[color:var(--color-blue)]/20 bg-[color:var(--color-blue)]/5 text-[var(--color-fg)]"
                              : "border-transparent text-[var(--color-fg-mute)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-mute)]",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-fg)]">
                            {candidate.name}
                          </span>
                          <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                            ID {candidate.id}
                          </span>
                          {selectedResellerId === candidate.id ? (
                            <CheckCircle2 className="size-3.5 text-[color:var(--color-blue)]" />
                          ) : null}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResellerDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void assignReseller()}
                disabled={resolutionSaving || resolutionLoading || !selectedResellerId}
              >
                {resolutionSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                Asignar partner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={mappingModalOpen}
          onOpenChange={(open) => {
            setMappingModalOpen(open);
            if (!open) setPendingStudioField(null);
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {selectedStudioTarget && pendingStudioField
                  ? t("studio.modal.title", {
                      target: selectedStudioTarget.label,
                      source: pendingStudioField.label,
                    })
                  : t("studio.title")}
              </DialogTitle>
              <DialogDescription>
                {selectedStudioTarget && pendingStudioField
                  ? t("studio.modal.description", { provider: providerTemplateName })
                  : t("studio.subtitle")}
              </DialogDescription>
            </DialogHeader>
            {selectedStudioTarget && pendingStudioField ? (
              <div className="grid gap-3">
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-subtle)] uppercase">
                    {t("studio.modal.target")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-fg)]">
                    {selectedStudioTarget.label}
                  </p>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-subtle)] uppercase">
                    {t("studio.modal.source")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-fg)]">
                    {pendingStudioField.label}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-fg-mute)]">
                    {pendingStudioField.value}
                  </p>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[color:var(--color-blue)]/20 bg-[color:var(--color-blue)]/5 p-3 text-sm text-[var(--color-fg)]">
                  {t("studio.modal.effect", { provider: providerTemplateName })}
                </div>
                {existingStudioAnnotation ? (
                  <div className="rounded-[var(--radius-sm)] border border-[color:var(--color-amber)]/20 bg-[color:var(--color-amber)]/5 p-3 text-sm text-[color:var(--color-amber)]">
                    {t("studio.modal.replaceWarning", {
                      source:
                        existingStudioAnnotation.source_hint ??
                        existingStudioAnnotation.target_field_key,
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMappingModalOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void confirmStudioMapping()}
                disabled={savingStudioMapping}
              >
                {savingStudioMapping ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("studio.modal.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── SKU Quick Dialog ─────────────────────────────────────────── */}
        {skuQuickDialog && (() => {
          const qLine = lines.find((l) => l.clientId === skuQuickDialog.lineId);
          const qResolved = qLine ? resolvedProductForLine(qLine) : null;
          const qSuggestions = buildSkuSuggestions(skuQuickDialog.sku, skuQuickDialog.description);
          const qSearch = skuQuickSearch.trim().toLowerCase();
          const qFiltered = qSearch
            ? odooProducts
                .filter((p) =>
                  [p.name, p.default_code, p.barcode]
                    .join(" ")
                    .toLowerCase()
                    .includes(qSearch),
                )
                .slice(0, 8)
            : qSuggestions.slice(0, 8).map((s) => s.product);

          return (
            <Dialog
              open={!!skuQuickDialog}
              onOpenChange={(open) => { if (!open) setSkuQuickDialog(null); }}
            >
              <DialogContent className="max-w-md gap-4">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {qResolved ? (
                      <PackageCheck size={16} className="text-emerald-500" />
                    ) : (
                      <PackageSearch size={16} className="text-amber-500" />
                    )}
                    {qResolved ? "Product matched" : "Resolve product"}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-xs">
                    SKU: {skuQuickDialog.sku}
                  </DialogDescription>
                </DialogHeader>

                {/* Resolved state */}
                {qResolved && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{qResolved.name}</p>
                        {qResolved.default_code && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {qResolved.default_code}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Search + results */}
                <div className="grid gap-2">
                  <div className="relative">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      placeholder="Search ERP catalog…"
                      value={skuQuickSearch}
                      onChange={(e) => setSkuQuickSearch(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                      autoFocus={!qResolved}
                    />
                  </div>
                  {qFiltered.length > 0 && (
                    <div className="grid max-h-52 gap-1 overflow-y-auto">
                      {qFiltered.map((product) => {
                        const isActive = qResolved?.odoo_product_id === product.odoo_product_id;
                        return (
                          <button
                            key={product.odoo_product_id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                              isActive
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "hover:bg-muted",
                            )}
                            onClick={async () => {
                              if (!qLine) return;
                              const nextLines = lines.map((l) =>
                                l.clientId === skuQuickDialog.lineId
                                  ? { ...l, odoo_product_id: product.odoo_product_id }
                                  : l,
                              );
                              setLines(nextLines);
                              await saveReview({ lines: nextLines }, { force: true });
                              setSkuQuickDialog(null);
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{product.name}</span>
                              {product.default_code && (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {product.default_code}
                                </span>
                              )}
                            </div>
                            {isActive && <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {qFiltered.length === 0 && qSearch && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No products match &ldquo;{skuQuickSearch}&rdquo;
                    </p>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSkuQuickDialog(null)}>
                    Close
                  </Button>
                  {qResolved && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSkuQuickDialog(null);
                        openSkuReplacement({
                          sku: skuQuickDialog.sku,
                          description: skuQuickDialog.description,
                          lineId: skuQuickDialog.lineId,
                        });
                      }}
                    >
                      Assign different
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}

        <Dialog
          open={skuModalOpen}
          onOpenChange={(open) => {
            setSkuModalOpen(open);
            if (!open) {
              setSkuModalSource(null);
              setSelectedSkuProductId(null);
              setSelectedSkuRule(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("studio.skuModal.title")}</DialogTitle>
              <DialogDescription>
                {t("studio.skuModal.description", { provider: providerTemplateName })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-subtle)] uppercase">
                    {t("studio.skuModal.providerSku")}
                  </p>
                  <p className="mt-1 font-mono text-sm text-[var(--color-fg)]">
                    {skuModalSource?.sku || "-"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-fg-mute)]">
                    {skuModalSource?.description || "-"}
                  </p>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-subtle)] uppercase">
                    {t("studio.skuModal.currentMapping")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-fg)]">
                    {existingSkuMapping?.odoo_product_name ?? t("studio.skuModal.noCurrentMapping")}
                  </p>
                  {existingSkuMapping?.odoo_default_code ? (
                    <p className="mt-1 font-mono text-xs text-[var(--color-fg-mute)]">
                      {existingSkuMapping.odoo_default_code}
                    </p>
                  ) : null}
                </div>
              </div>
              {skuModalSuggestions.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-xs font-semibold tracking-[0.08em] text-[var(--color-fg-subtle)] uppercase">
                    {t("studio.skuModal.suggestions")}
                  </p>
                  <div className="grid gap-1">
                    {skuModalSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.reason}-${suggestion.product.odoo_product_id}`}
                        type="button"
                        onClick={() => {
                          setSelectedSkuProductId(suggestion.product.odoo_product_id);
                          setSelectedSkuRule(suggestion.rule ?? null);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-3 py-2 text-left transition-colors",
                          selectedSkuProductId === suggestion.product.odoo_product_id
                            ? "border-[color:var(--color-blue)]/40 bg-[color:var(--color-blue)]/5"
                            : "border-[var(--color-border)] hover:bg-[var(--color-surface)]",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                            {suggestion.product.name}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-[var(--color-fg-mute)]">
                            {[suggestion.product.default_code, suggestion.product.barcode]
                              .filter(Boolean)
                              .join(" · ") || "-"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-medium text-[var(--color-fg-mute)]">
                          {suggestion.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Input
                  value={skuProductQuery}
                  onChange={(event) => setSkuProductQuery(event.target.value)}
                  placeholder={t("studio.skuModal.searchPlaceholder")}
                  className="h-10"
                />
                <div className="max-h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
                  {filteredSkuProducts.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-[var(--color-fg-mute)]">
                      {tCommon("noResults")}
                    </p>
                  ) : (
                    filteredSkuProducts.map((product) => (
                      <button
                        key={product.odoo_product_id}
                        type="button"
                        onClick={() => {
                          setSelectedSkuProductId(product.odoo_product_id);
                          setSelectedSkuRule(null);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors",
                          selectedSkuProductId === product.odoo_product_id
                            ? "bg-[color:var(--color-blue)]/5 text-[var(--color-fg)]"
                            : "text-[var(--color-fg)] hover:bg-[var(--color-surface)]",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{product.name}</p>
                          <p className="mt-1 truncate font-mono text-xs text-[var(--color-fg-mute)]">
                            {[product.default_code, product.barcode].filter(Boolean).join(" · ") ||
                              "-"}
                          </p>
                        </div>
                        {selectedSkuProductId === product.odoo_product_id ? (
                          <CheckCircle2 className="size-4 shrink-0 text-[color:var(--color-blue)]" />
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-[var(--radius-sm)] border border-[color:var(--color-blue)]/20 bg-[color:var(--color-blue)]/5 p-3 text-sm text-[var(--color-fg)]">
                {t("studio.skuModal.effect", { provider: providerTemplateName })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSkuModalOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void confirmSkuReplacement()}
                disabled={savingSkuMapping || !selectedSkuProductId}
              >
                {savingSkuMapping ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("studio.skuModal.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Re-analyze confirmation dialog ──────────────────────────── */}
        <Dialog open={reanalyzeConfirmOpen} onOpenChange={setReanalyzeConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle>Re-analizar con IA</DialogTitle>
                  <DialogDescription className="mt-1.5 text-[12px]">
                    Esta acción enviará el documento nuevamente al modelo de IA y <strong>consumirá tokens</strong> de tu cuenta.
                    Los datos extraídos actualmente serán reemplazados por los nuevos resultados.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="rounded-md border border-amber-400/25 bg-amber-50/60 px-3 py-2.5 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
              💡 Usa esto solo si los datos extraídos están claramente incorrectos.
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReanalyzeConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setReanalyzeConfirmOpen(false);
                  void reanalyzeDocument();
                }}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                <Sparkles size={13} />
                Sí, re-analizar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── JSON Drawer ─────────────────────────────────────────────── */}
        <Drawer open={jsonDrawerOpen} onOpenChange={setJsonDrawerOpen} direction="right">
          <DrawerContent className="flex flex-col data-[vaul-drawer-direction=right]:w-[min(640px,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[640px]">
            {/* Header — polished pro layout */}
            <div className="shrink-0 border-b border-border bg-card">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
                    <Braces size={17} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <DrawerTitle className="text-[15px] font-semibold leading-tight text-foreground">
                      Extracción JSON
                    </DrawerTitle>
                    <p className="mt-1 text-[12px] leading-tight text-muted-foreground">
                      Payload completo devuelto por el modelo de IA
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(extractionJson);
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 2000);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-all",
                      copiedJson
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                    {copiedJson ? "Copiado" : "Copiar"}
                  </button>
                  <DrawerClose asChild>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Cerrar"
                    >
                      <X size={14} />
                    </button>
                  </DrawerClose>
                </div>
              </div>
              {/* Meta strip */}
              <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-5 py-1.5 text-[10px] font-mono text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />application/json</span>
                <span className="opacity-50">·</span>
                <span>{extractionJson.split("\n").length} lines</span>
                <span className="opacity-50">·</span>
                <span>{(new Blob([extractionJson]).size / 1024).toFixed(1)} KB</span>
              </div>
            </div>

            {/* Code area — light theme code editor */}
            <div className="min-h-0 flex-1 overflow-auto bg-[#fafafa] dark:bg-zinc-50">
              <div className="flex">
                {/* Line numbers */}
                <div className="shrink-0 select-none border-r border-zinc-200 bg-zinc-100/70 px-3 py-5 text-right font-mono text-[11px] leading-[1.7] text-zinc-400">
                  {extractionJson.split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                {/* Highlighted JSON */}
                <pre
                  className="min-w-0 flex-1 px-5 py-5 font-mono text-[12px] leading-[1.7] text-zinc-800 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(extractionJson) }}
                />
              </div>
            </div>
          </DrawerContent>
        </Drawer>

        {/* ── Studio Drawer ────────────────────────────────────────────── */}
        <Drawer open={studioDrawerOpen} onOpenChange={(v) => { setStudioDrawerOpen(v); if (!v) setSelectedStudioTarget(null); }} direction="right">
          <DrawerContent className="flex flex-col data-[vaul-drawer-direction=right]:w-[min(780px,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[780px]">
            {/* Header */}
            <div className="shrink-0 border-b border-border bg-card">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400">
                    <WandSparkles size={17} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <DrawerTitle className="text-[15px] font-semibold leading-tight text-foreground">
                      Studio
                    </DrawerTitle>
                    <p className="mt-1 text-[12px] leading-tight text-muted-foreground">
                      Aprende qué campo del documento corresponde a cada campo de ERP
                    </p>
                  </div>
                </div>
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Cerrar"
                  >
                    <X size={14} />
                  </button>
                </DrawerClose>
              </div>
              {/* Meta strip */}
              <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-5 py-1.5 text-[10px] font-mono text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", selectedStudioTarget ? "bg-blue-500" : "bg-muted-foreground/30")} />
                  {selectedStudioTarget ? "mapping" : "idle"}
                </span>
                <span className="opacity-50">·</span>
                <span>{annotationByTarget.size}/{learnableTargets.length} mapped</span>
              </div>
            </div>

            {/* Step bar */}
            <div className={cn(
              "shrink-0 flex items-center gap-0 border-b text-[12px] transition-colors",
              selectedStudioTarget ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40" : "border-border bg-card",
            )}>
              <div className={cn("flex items-center gap-2 px-5 py-2.5 border-r border-inherit", !selectedStudioTarget ? "text-foreground" : "text-muted-foreground")}>
                {/* eslint-disable-next-line no-restricted-syntax */}
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", !selectedStudioTarget ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1</span>
                <span className="font-medium whitespace-nowrap">Selecciona campo objetivo →</span>
              </div>
              <div className="flex flex-1 items-center gap-3 px-5 py-2.5 min-w-0">
                {/* eslint-disable-next-line no-restricted-syntax */}
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", selectedStudioTarget ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground opacity-50")}>2</span>
                {selectedStudioTarget ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground text-[12px]">Mapeando</span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <WandSparkles size={10} />{selectedStudioTarget.label}
                    </span>
                    <span className="text-muted-foreground text-[12px]">→ haz click en el campo del documento</span>
                    <button type="button" onClick={() => setSelectedStudioTarget(null)} className="ml-auto shrink-0 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors">{t("toolbar.cancel")}</button>
                  </div>
                ) : (
                  <span className="text-muted-foreground opacity-60 font-medium whitespace-nowrap text-[12px]">Haz click en un campo del documento</span>
                )}
              </div>
            </div>

            {/* Studio content */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto grid max-w-5xl gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="grid gap-3">
                  <div className={cn("grid gap-3", !selectedStudioTarget && "opacity-80")}>
                    {studioFieldsByGroup.map((group) =>
                      group.items.length > 0 ? (
                        // eslint-disable-next-line no-restricted-syntax
                        <div key={group.id} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{group.items.length}</span>
                          </div>
                          <div className="divide-y divide-border">
                            {group.items.map((field) => {
                              const isSelected = pendingStudioField?.id === field.id;
                              const matchedAnnotation = fieldAnnotations.find((a) => {
                                const l = typeof a.selection_meta?.extracted_label === "string" ? a.selection_meta.extracted_label : null;
                                const k = typeof a.selection_meta?.extracted_key === "string" ? a.selection_meta.extracted_key : null;
                                return l === field.label || k === field.key;
                              });
                              const mappedLabel = matchedAnnotation ? (learnableTargetMap.get(matchedAnnotation.target_field_key)?.label ?? "Mapped") : null;
                              const isClickable = !!selectedStudioTarget;
                              return (
                                <div key={field.id} onClick={() => selectStudioField(field)}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectStudioField(field); } }}
                                  role="button" tabIndex={0}
                                  className={cn("flex items-center gap-3 px-3 py-2.5 text-left transition-colors outline-none",
                                    isClickable ? "cursor-pointer hover:bg-blue-50 focus:bg-blue-50 dark:hover:bg-blue-950/30" : "cursor-default",
                                    isSelected && "bg-blue-50 dark:bg-blue-950/30",
                                  )}>
                                  {isClickable && (
                                    /* eslint-disable-next-line no-restricted-syntax */
                                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                      isSelected ? "border-blue-500 bg-blue-500" : "border-muted-foreground/30")}>
                                      {/* eslint-disable-next-line no-restricted-syntax */}
                                      {isSelected && <span className="size-1.5 rounded-full bg-white" />}
                                    </span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-medium text-muted-foreground">{field.label}</span>
                                      {mappedLabel && (
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                          <CheckCircle2 size={9} />{mappedLabel}
                                        </span>
                                      )}
                                    </div>
                                    <p className={cn("mt-0.5 text-sm font-medium leading-snug", isClickable ? "text-foreground" : "text-foreground/80")}>
                                      {field.value || <span className="italic text-muted-foreground text-xs">empty</span>}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">p.{field.page}</span>
                                  {group.id === "lines" && looksLikeSkuField(field) && (
                                    <button type="button"
                                      onClick={(e) => { e.stopPropagation(); openSkuReplacement({ sku: field.value, description: field.label }); }}
                                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                                      {t("studio.replaceSku")}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
                {/* Right: Learnable target fields */}
                <div className="xl:sticky xl:top-5 h-fit">
                  {/* eslint-disable-next-line no-restricted-syntax */}
                  <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                    <div className="border-b border-border bg-muted/40 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Campos objetivo</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">Se guardan en la plantilla y se aplican automáticamente</p>
                    </div>
                    {(["header", "lines", "shipping", "notes"] as const).map((section) => {
                      const sectionTargets = learnableTargets.filter((t2) => t2.section === section);
                      if (sectionTargets.length === 0) return null;
                      const sectionLabels: Record<string, string> = { header: "Header", lines: "Line items", shipping: "Addresses", notes: "Notes" };
                      return (
                        <div key={section} className="border-b border-border last:border-b-0">
                          <div className="bg-muted/20 px-3 py-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{sectionLabels[section]}</span>
                          </div>
                          <div className="divide-y divide-border/50">
                            {sectionTargets.map((target) => {
                              const annotation = annotationByTarget.get(target.key);
                              const active = selectedStudioTarget?.key === target.key;
                              return (
                                <button key={target.key} type="button" onClick={() => selectStudioTarget(target.key)}
                                  className={cn("group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors", active ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-muted/50")}>
                                  {/* eslint-disable-next-line no-restricted-syntax */}
                                  <span className={cn("size-1.5 shrink-0 rounded-full", annotation ? "bg-emerald-500" : "bg-muted-foreground/25")} />
                                  <div className="min-w-0 flex-1">
                                    <p className={cn("text-[12px] font-medium leading-none", active ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>{target.label}</p>
                                    {annotation?.source_hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">→ {annotation.source_hint}</p>}
                                  </div>
                                  {active ? <span className="shrink-0 rounded bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white">ACTIVE</span>
                                    : annotation ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                                    : <span className="shrink-0 rounded border border-dashed border-muted-foreground/25 px-1.5 py-0.5 text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">map</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>

        {/* ── HTML Drawer ──────────────────────────────────────────────── */}
        <Drawer open={htmlDrawerOpen} onOpenChange={setHtmlDrawerOpen} direction="right">
          <DrawerContent className="flex flex-col data-[vaul-drawer-direction=right]:w-[min(760px,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[760px]">
            <div className="shrink-0 border-b border-border bg-card">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    <Globe size={17} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0">
                    <DrawerTitle className="text-[15px] font-semibold leading-tight text-foreground">
                      Documento HTML
                    </DrawerTitle>
                    <p className="mt-1 text-[12px] leading-tight text-muted-foreground">
                      Vista renderizada del Purchase Order — lista para imprimir
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const iframe = window.document.querySelector<HTMLIFrameElement>("#html-preview-frame");
                      iframe?.contentWindow?.print();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Printer size={12} />{t("toolbar.print")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const html = generatePoHtml({
                        poNumber, poDate, customer, currency, paymentTerms, customerAddress,
                        deliveryAddress, locale,
                        docNumber: document.docNumber ?? document.id.slice(0, 8).toUpperCase(),
                        lines: lines.map((l) => ({ sku: l.sku, description: l.description, quantity: l.quantity, unit_price: l.unit_price, unit: l.unit, line_total: lineTotal(l) })),
                        subtotal: displayedTotals.subtotal, taxTotal: displayedTotals.taxTotal, total: displayedTotals.total,
                      });
                      const blob = new Blob([html], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = window.document.createElement("a");
                      a.href = url; a.download = `PO-${poNumber || document.id.slice(0, 8)}.html`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Download size={12} />{t("toolbar.save")}
                  </button>
                  <DrawerClose asChild>
                    <button
                      type="button"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Cerrar"
                    >
                      <X size={14} />
                    </button>
                  </DrawerClose>
                </div>
              </div>
              {/* Meta strip */}
              <div className="flex items-center gap-3 border-t border-border/60 bg-muted/30 px-5 py-1.5 text-[10px] font-mono text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />text/html</span>
                <span className="opacity-50">·</span>
                <span>PO {poNumber || "—"}</span>
                <span className="opacity-50">·</span>
                <span>{lines.length} line items</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              <iframe
                id="html-preview-frame"
                className="h-full w-full border-0"
                srcDoc={generatePoHtml({
                  poNumber, poDate, customer, currency, paymentTerms, customerAddress,
                  deliveryAddress, locale,
                  docNumber: document.docNumber ?? document.id.slice(0, 8).toUpperCase(),
                  lines: lines.map((l) => ({ sku: l.sku, description: l.description, quantity: l.quantity, unit_price: l.unit_price, unit: l.unit, line_total: lineTotal(l) })),
                  subtotal: displayedTotals.subtotal, taxTotal: displayedTotals.taxTotal, total: displayedTotals.total,
                })}
                title="Purchase Order Preview"
              />
            </div>
          </DrawerContent>
        </Drawer>

        <KeyboardHelpOverlay
          open={keyboardHelpOpen}
          onClose={() => setKeyboardHelpOpen(false)}
        />

      </div>
    </div>
  );
}

const inputClassName =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-fg)] text-sm outline-none transition-colors focus:border-[var(--color-fg)] disabled:bg-[var(--color-surface-mute)] disabled:text-[var(--color-fg-mute)]";

function SaveState({ dirty, saving, dark }: { dirty: boolean; saving: boolean; dark?: boolean }) {
  const t = useTranslations("review.saveState");
  if (saving)
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs", dark ? "text-white/50" : "text-[var(--color-fg-mute)]")}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-[2px] bg-current" aria-hidden="true" />
        {t("saving")}
      </span>
    );
  if (dirty)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-amber-400" aria-hidden="true" />
        {t("unsaved")}
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", dark ? "text-white/50" : "text-[var(--color-fg-mute)]")}>
      <span className="h-1.5 w-1.5 rounded-[2px] bg-emerald-400" aria-hidden="true" />
      {t("saved")}
    </span>
  );
}


// MissingRequiredNotice removed — alerts live in the control center's notification hub (AlertRow)

function EditableField({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  type = "text",
  maxLength,
  required,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
  type?: string;
  maxLength?: number;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <FieldLabel label={label} required={required} />
      <Input
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          inputClassName,
          "h-11",
          invalid && "border-[color:var(--color-amber)] bg-[color:var(--color-amber)]/5",
        )}
      />
      {hint ? (
        <span
          className={cn(
            "text-xs leading-4",
            invalid ? "text-[color:var(--color-amber)]" : "text-[var(--color-fg-subtle)]",
          )}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function EditableTextAreaField({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  required,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <FieldLabel label={label} required={required} />
      <Textarea
        value={value}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          inputClassName,
          "min-h-20 resize-y py-2",
          invalid && "border-[color:var(--color-amber)] bg-[color:var(--color-amber)]/5",
        )}
      />
      {hint ? (
        <span
          className={cn(
            "text-xs leading-4",
            invalid ? "text-[color:var(--color-amber)]" : "text-[var(--color-fg-subtle)]",
          )}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const t = useTranslations("review.required");
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--color-fg)]">
      <span className="truncate">{label}</span>
      {required ? (
        <span className="shrink-0 rounded-[var(--radius-sm)] border border-[color:var(--color-rose)]/20 bg-[color:var(--color-rose)]/5 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-rose)] uppercase">
          {t("requiredShort")}
        </span>
      ) : null}
    </span>
  );
}

function LabeledLineInput({
  label,
  invalid,
  required,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
  type?: string;
  invalid?: boolean;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <FieldLabel label={label} required={required} />
      <LineInput {...props} invalid={invalid} />
    </label>
  );
}

function LineInput({
  value,
  onChange,
  onBlur,
  disabled,
  type = "text",
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  disabled: boolean;
  type?: string;
  invalid?: boolean;
}) {
  return (
    <Input
      type={type}
      value={value}
      disabled={disabled}
      step={type === "number" ? "0.0001" : undefined}
      inputMode={type === "number" ? "decimal" : undefined}
      autoComplete="off"
      aria-invalid={invalid || undefined}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        inputClassName,
        "h-7 min-w-20 px-2",
        invalid && "border-[color:var(--color-amber)] bg-[color:var(--color-amber)]/5",
      )}
    />
  );
}


// StudioSelectable: field mapping now lives exclusively in the Studio panel
// (the "Learnable target fields" right sidebar in Studio mode). Fields in the
// review tabs are no longer clickable for mapping — keeping the sidebar clean.
/**
 * AlertRow — single notification row for the control center's notification hub.
 * All alerts in the review workspace must use this component and live in Zone B
 * of the Information Control Center. Never add alert UI outside the control center.
 */
function AlertRow({
  children,
  tone = "amber",
}: {
  children: React.ReactNode;
  tone?: "amber" | "red" | "blue" | "green" | "violet";
}) {
  const styles: Record<string, string> = {
    amber:  "bg-amber-500/6 text-amber-700 dark:text-amber-400 border-b border-amber-500/15 last:border-b-0",
    red:    "bg-destructive/6 text-destructive border-b border-destructive/15 last:border-b-0",
    blue:   "bg-blue-500/6 text-blue-700 dark:text-blue-400 border-b border-blue-500/15 last:border-b-0",
    green:  "bg-emerald-500/6 text-emerald-700 dark:text-emerald-400 border-b border-emerald-500/15 last:border-b-0",
    violet: "bg-violet-500/6 text-violet-700 dark:text-violet-400 border-b border-violet-500/15 last:border-b-0",
  };
  return (
    <div className={cn("flex items-center gap-2 px-4 py-1.5 text-[10.5px] font-medium", styles[tone])}>
      {children}
    </div>
  );
}

function StudioSelectable({
  children,
}: {
  active?: boolean;
  mapped?: boolean;
  enabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return <>{children}</>;
}
