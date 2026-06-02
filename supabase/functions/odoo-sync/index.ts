import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { emitWorkflowEvent } from "../_shared/events.ts";
import { secrets } from "../_shared/secrets.ts";
import { decrypt } from "../_shared/crypto.ts";
import { buildSaleOrderLineVals } from "./line-vals.ts";

interface OdooSyncPayload {
  order_draft_id?: string;
  tenant_id?: string;
  run_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function validUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function readJsonText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text || null;
}

function readJsonTextAny(value: unknown, keys: string[]): string | null {
  for (const key of keys) {
    const text = readJsonText(value, key);
    if (text) return text;
  }
  return null;
}

type AddressInput = {
  name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  country: string | null;
};

// ─── Address block parser ─────────────────────────────────────────────────────
// Parses a raw address string (single-line comma-separated or multiline) into
// structured components. The first segment is treated as a recipient name when
// it contains no digits and no street-type keywords.

const US_STATE_CODES = new Set([
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

function inferCountry(state: string | null, zip: string | null): string | null {
  if (state && zip && US_STATE_CODES.has(state.toUpperCase()) && /^\d{5}/.test(zip)) {
    return "United States";
  }
  return null;
}

function looksLikeStreetSegment(segment: string): boolean {
  const s = segment.trim();
  return (
    /\d/.test(s) ||
    /\bP\.?O\.?\s*BOX\b/i.test(s) ||
    /\b(BLVD|BOULEVARD|AVE|AVENUE|ROAD|DRIVE|LANE|WAY|HWY|HIGHWAY|ROUTE|PKWY|PARKWAY|COURT|PLACE|CIRCLE|LOOP|TRAIL|SUITE|APT|UNIT|FLOOR)\b/i.test(
      s,
    ) ||
    /\b(RD|DR|LN|ST|CT|PL|CIR|TRL|STE|FL)\b/.test(s)
  );
}

// Matches common country names / ISO-2 codes that appear at the end of an address
const TRAILING_COUNTRY_RE =
  /^(united states(?: of america)?|u\.s\.a?\.?|usa|us|canada|ca|mexico|mx|uk|united kingdom|great britain|gb|australia|au|germany|de|france|fr|spain|es|japan|jp|china|cn|brazil|br|india|in)$/i;

function parseAddressBlock(block: string): Partial<AddressInput> {
  const trimmed = block.trim();
  if (!trimmed) return {};

  // Prefer newline split; fall back to comma split for single-line addresses
  let segs: string[];
  const byLine = trimmed
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  segs =
    byLine.length >= 2
      ? byLine
      : trimmed
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);

  if (segs.length === 0) return {};
  if (segs.length === 1) return { street: segs[0] };

  let name: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  let country: string | null = null;

  // ── Step 1: strip trailing country segment FIRST ──────────────────────────
  // This fixes "1226 Burch Cove Way, Knoxville, TN 37922, United States"
  // where "United States" is the last segment and blocks state/zip detection.
  if (segs.length > 1 && TRAILING_COUNTRY_RE.test(segs[segs.length - 1])) {
    country = segs[segs.length - 1];
    segs = segs.slice(0, -1);
  }

  // ── Step 2: match State+ZIP (and optionally City) from the new last seg ───
  // Patterns: "MT 59859" | "MT 59859 USA" | "PLAINS, MT 59859" | "Knoxville, TN 37922"
  const stateZipRe = /^([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;
  const cityStateZipRe = /^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;

  const lastSeg = segs[segs.length - 1];
  const csz = lastSeg.match(cityStateZipRe);
  const sz = !csz ? lastSeg.match(stateZipRe) : null;

  if (csz) {
    city = csz[1].trim() || null;
    state = csz[2].toUpperCase();
    zip = csz[3];
    if (!country) country = csz[4]?.trim() || null;
    segs = segs.slice(0, -1);
  } else if (sz) {
    state = sz[1].toUpperCase();
    zip = sz[2];
    if (!country) country = sz[3]?.trim() || null;
    segs = segs.slice(0, -1);
    // City may be the new last segment
    if (segs.length > 0) {
      const maybeCity = segs[segs.length - 1];
      if (!looksLikeStreetSegment(maybeCity) && !TRAILING_COUNTRY_RE.test(maybeCity)) {
        city = maybeCity;
        segs = segs.slice(0, -1);
      }
    }
  }

  // ── Step 3: first remaining no-digits segment is a recipient name ─────────
  if (segs.length >= 2 && !looksLikeStreetSegment(segs[0])) {
    name = segs[0];
    segs = segs.slice(1);
  }

  const street = segs.join(", ") || null;
  const resolvedCountry = country ?? inferCountry(state, zip);
  return { name, street, city, state, zip, country: resolvedCountry };
}

function normalizeAddress(raw: unknown, fallback: Partial<AddressInput> = {}): AddressInput {
  if (typeof raw === "string") {
    const parsed = parseAddressBlock(raw.trim());
    return {
      name: parsed.name ?? fallback.name ?? null,
      contact_person: fallback.contact_person ?? null,
      email: fallback.email ?? null,
      phone: fallback.phone ?? null,
      street: parsed.street ?? null,
      street2: null,
      city: parsed.city ?? null,
      zip: parsed.zip ?? null,
      state: parsed.state ?? null,
      country: parsed.country ?? fallback.country ?? null,
    };
  }

  const fromJson = {
    name: readJsonTextAny(raw, ["name", "full_name", "recipient"]),
    contact_person: readJsonTextAny(raw, ["contact_person", "additional_name", "attention", "attn", "contact_name"]),
    email: readJsonTextAny(raw, ["email", "mail"]),
    phone: readJsonTextAny(raw, ["phone", "mobile", "tel"]),
    street: readJsonTextAny(raw, ["line1", "street", "address", "address1"]),
    street2: readJsonTextAny(raw, ["line2", "street2", "address2"]),
    city: readJsonTextAny(raw, ["city", "town"]),
    zip: readJsonTextAny(raw, ["zip", "postal_code", "postcode"]),
    state: readJsonTextAny(raw, ["state", "state_name", "province", "region"]),
    country: readJsonTextAny(raw, ["country", "country_name"]),
  };

  // Only geographic fields (city/state/zip) count as "explicit" —
  // a name alone does NOT mean the street has been pre-parsed. When only name
  // and a full-address line1 are present (e.g. from ai-process), we still need
  // to call parseAddressBlock to split city/state/zip out of line1.
  const hasExplicitComponents = !!(fromJson.city || fromJson.state || fromJson.zip);
  if (!hasExplicitComponents && fromJson.street) {
    const parsed = parseAddressBlock(fromJson.street);
    return {
      // Prefer the explicit JSON name over what we may have parsed out of the
      // address string. Real-world payloads look like
      // { name: "Ellen Paul", line1: "112 Mount Rd, Cummington, MA 01026, US" }
      // — the recipient name lives in the JSON, not inside line1.
      name: fromJson.name ?? parsed.name ?? fallback.name ?? null,
      contact_person: fromJson.contact_person ?? fallback.contact_person ?? null,
      email: fromJson.email ?? fallback.email ?? null,
      phone: fromJson.phone ?? fallback.phone ?? null,
      street: parsed.street ?? null,
      street2: fromJson.street2 ?? fallback.street2 ?? null,
      city: parsed.city ?? null,
      zip: parsed.zip ?? null,
      state: parsed.state ?? null,
      country: fromJson.country ?? parsed.country ?? fallback.country ?? null,
    };
  }

  // For fully structured addresses, infer country from state+zip when not explicit
  const explicitCountry = fromJson.country ?? fallback.country ?? null;
  const resolvedCountry =
    explicitCountry ??
    inferCountry(fromJson.state ?? fallback.state ?? null, fromJson.zip ?? fallback.zip ?? null);

  const rawName   = fromJson.name   ?? fallback.name   ?? null;
  let   rawStreet = fromJson.street ?? fallback.street ?? null;
  const rawCity   = fromJson.city   ?? fallback.city   ?? null;
  const rawZip    = fromJson.zip    ?? fallback.zip    ?? null;
  const rawState  = fromJson.state  ?? fallback.state  ?? null;

  // When the AI extracts only a company name into the street field (no city/state/zip),
  // it's not a real street — move it to name (if name is empty) or discard it.
  if (rawStreet && !rawCity && !rawState && !rawZip && !/\d/.test(rawStreet)) {
    if (!rawName) {
      return {
        name: rawStreet,
        contact_person: fromJson.contact_person ?? fallback.contact_person ?? null,
        email: fromJson.email ?? fallback.email ?? null,
        phone: fromJson.phone ?? fallback.phone ?? null,
        street: null,
        street2: fromJson.street2 ?? fallback.street2 ?? null,
        city: null,
        zip: null,
        state: null,
        country: resolvedCountry,
      };
    }
    rawStreet = null;
  }

  return {
    name: rawName,
    contact_person: fromJson.contact_person ?? fallback.contact_person ?? null,
    email: fromJson.email ?? fallback.email ?? null,
    phone: fromJson.phone ?? fallback.phone ?? null,
    street: rawStreet,
    street2: fromJson.street2 ?? fallback.street2 ?? null,
    city: rawCity,
    zip: rawZip,
    state: rawState,
    country: resolvedCountry,
  };
}

// ─── Contact export settings ──────────────────────────────────────────────────

interface ContactSettings {
  customer_match_field: "name" | "email" | "vat";
  customer_match_scope: "under_reseller" | "global";
  customer_is_company: boolean;
  create_if_not_found: boolean;
  sync_billing_address: boolean;
  sync_shipping_address: boolean;
  address_update_strategy: "always" | "create_only" | "skip";
  update_contact_info: boolean;
}

const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  customer_match_field: "name",
  customer_match_scope: "under_reseller",
  customer_is_company: false,
  create_if_not_found: true,
  sync_billing_address: true,
  sync_shipping_address: true,
  address_update_strategy: "always",
  update_contact_info: true,
};

// ─── Odoo JSON-RPC client ─────────────────────────────────────────────────────

interface OdooConnection {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
}

// Per-call timeout — generous enough for slow Odoo instances.
const ODOO_CALL_TIMEOUT_MS = 30_000;
// Transient HTTP status codes that we retry once.
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);

async function odooCallOnce(
  conn: OdooConnection,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ODOO_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${conn.baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Math.floor(Math.random() * 100000),
        params: { service, method, args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw Object.assign(new Error(`Odoo HTTP error ${res.status}`), { httpStatus: res.status });
    }

    const body = (await res.json()) as {
      result?: unknown;
      error?: { data?: { message?: string } };
    };
    if (body.error) throw new Error(body.error.data?.message ?? "Odoo RPC error");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

async function odooCall(
  conn: OdooConnection,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  try {
    return await odooCallOnce(conn, service, method, args);
  } catch (err) {
    // Retry once on transient HTTP errors or network/timeout failures.
    const isTransient =
      err instanceof Error &&
      (("httpStatus" in err &&
        TRANSIENT_HTTP.has((err as { httpStatus?: number }).httpStatus ?? 0)) ||
        err.name === "AbortError" ||
        err.message.includes("fetch failed") ||
        err.message.includes("network"));
    if (isTransient) {
      // Back off briefly before retry
      await new Promise((r) => setTimeout(r, 1500));
      return await odooCallOnce(conn, service, method, args);
    }
    throw err;
  }
}

async function odooAuthenticate(conn: OdooConnection): Promise<number> {
  const uid = await odooCall(conn, "common", "authenticate", [
    conn.database,
    conn.username,
    conn.password,
    {},
  ]);
  if (typeof uid !== "number" || uid === 0) {
    throw new Error("Odoo authentication failed — check credentials");
  }
  return uid;
}

async function odooExecute(
  conn: OdooConnection,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return odooCall(conn, "object", "execute_kw", [
    conn.database,
    uid,
    conn.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ─── Customer hierarchy resolution (reseller -> customer -> addresses) ───────

// Resolves the reseller company for a given Odoo partner id.
// Walks up the parent_id chain until it finds a partner with is_company=true.
// Stops at the first company so we never climb into the database's own company.
async function resolveRootCompanyPartnerId(
  conn: OdooConnection,
  uid: number,
  partnerId: number,
): Promise<number> {
  let currentId = partnerId;
  for (let hop = 0; hop < 6; hop++) {
    const rows = (await odooExecute(conn, uid, "res.partner", "read", [
      [currentId],
      ["id", "is_company", "parent_id"],
    ])) as Array<{ id: number; is_company: boolean; parent_id: false | [number, string] | null }>;

    if (!rows.length) {
      throw new Error(`Odoo partner id=${currentId} not found — check reseller mapping`);
    }

    const partner = rows[0];

    // Stop at the first company we encounter — prevents climbing into Action INC
    // (or any other database-level company that is a parent of the reseller).
    if (partner.is_company) return partner.id;

    const rawParent = partner.parent_id;
    if (!rawParent) return partner.id;

    // parent_id comes back as [id, "Display Name"] in Odoo JSON-RPC
    const parentId = Array.isArray(rawParent) ? (rawParent[0] as number) : Number(rawParent);
    if (!Number.isFinite(parentId) || parentId === currentId) return partner.id;

    currentId = parentId;
  }
  return currentId;
}

async function resolveCustomerPartnerId(
  conn: OdooConnection,
  uid: number,
  resellerId: number,
  customerName: string | null,
  customerEmail: string | null,
  customerPhone: string | null,
  customerVat: string | null,
  customerContactPerson: string | null,
  customerMappingId: string | null,
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  settings: ContactSettings,
): Promise<number> {
  if (customerMappingId) {
    const { data: mapping } = await supabase
      .from("customer_mappings")
      .select("odoo_partner_id")
      .eq("id", customerMappingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mapping?.odoo_partner_id) {
      if (settings.update_contact_info) {
        const updates: Record<string, unknown> = {};
        if (customerEmail) updates.email = customerEmail;
        if (customerPhone) updates.phone = customerPhone;
        if (customerContactPerson) updates.csf_contact_person = customerContactPerson;
        if (Object.keys(updates).length > 0) {
          await odooExecute(conn, uid, "res.partner", "write", [
            [mapping.odoo_partner_id],
            updates,
          ]).catch(() => {});
        }
      }
      return mapping.odoo_partner_id;
    }
  }

  // Build search domain based on match_field and match_scope
  const buildDomain = (matchValue: string | null): unknown[] | null => {
    if (!matchValue) return null;
    const filter: unknown[] =
      settings.customer_match_field === "email"
        ? [["email", "=", matchValue]]
        : settings.customer_match_field === "vat"
          ? [["vat", "=", matchValue]]
          : [["name", "ilike", matchValue]];
    if (settings.customer_match_scope === "under_reseller") {
      filter.push(["parent_id", "=", resellerId]);
    }
    return filter;
  };

  const matchValue =
    settings.customer_match_field === "email"
      ? customerEmail
      : settings.customer_match_field === "vat"
        ? customerVat
        : customerName;

  const domain = buildDomain(matchValue) ?? (customerName ? buildDomain(customerName) : null);

  if (!domain) {
    throw new Error("No customer name or mapping available");
  }

  const results = (await odooExecute(conn, uid, "res.partner", "search_read", [
    domain,
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;

  // Concatenate the contact person into the partner name — keeps the data
  // simple and matches the legacy display format.
  const composedCustomerName = customerContactPerson
    ? `${customerName ?? matchValue ?? "Unknown"}, ${customerContactPerson}`
    : (customerName ?? matchValue ?? "Unknown");

  if (results.length > 0) {
    if (settings.update_contact_info) {
      const updates: Record<string, unknown> = {};
      if (customerEmail) updates.email = customerEmail;
      if (customerPhone) updates.phone = customerPhone;
      if (Object.keys(updates).length > 0) {
        await odooExecute(conn, uid, "res.partner", "write", [[results[0].id], updates]).catch(
          () => {},
        );
      }
    }
    return results[0].id;
  }

  if (!settings.create_if_not_found) {
    throw new Error(
      `Customer not found in Odoo (match_field=${settings.customer_match_field}). Auto-create is disabled.`,
    );
  }

  const customerVals: Record<string, unknown> = {
    name: composedCustomerName,
    customer_rank: 1,
    is_company: settings.customer_is_company,
    company_type: settings.customer_is_company ? "company" : "person",
    parent_id: resellerId,
  };
  if (customerEmail) customerVals.email = customerEmail;
  if (customerPhone) customerVals.phone = customerPhone;
  if (customerVat) customerVals.vat = customerVat;

  const customerId = (await odooExecute(conn, uid, "res.partner", "create", [
    customerVals,
  ])) as number;
  return customerId;
}

async function resolveCountryId(
  conn: OdooConnection,
  uid: number,
  country: string | null,
): Promise<number | null> {
  if (!country) return null;
  const found = (await odooExecute(conn, uid, "res.country", "search_read", [
    [["name", "ilike", country]],
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;
  return found[0]?.id ?? null;
}

async function resolveStateId(
  conn: OdooConnection,
  uid: number,
  state: string | null,
  countryId: number | null,
): Promise<number | null> {
  if (!state) return null;
  const codeLike = /^[A-Za-z]{2,3}$/.test(state.trim());
  const field = codeLike ? "code" : "name";
  const domain: unknown[] = [[field, "ilike", state]];
  if (countryId) domain.push(["country_id", "=", countryId]);

  const found = (await odooExecute(conn, uid, "res.country.state", "search_read", [
    domain,
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;
  return found[0]?.id ?? null;
}

async function resolveAddressPartnerId(
  conn: OdooConnection,
  uid: number,
  customerPartnerId: number,
  type: "invoice" | "delivery",
  input: AddressInput,
  strategy: "always" | "create_only" | "skip",
): Promise<number> {
  if (strategy === "skip") return customerPartnerId;

  // If billing address has no real location data, skip creating a child partner
  // and use the customer partner directly as the invoice address.
  if (type === "invoice" && !input.street && !input.city && !input.zip) {
    return customerPartnerId;
  }

  const countryId = await resolveCountryId(conn, uid, input.country);
  const stateId = await resolveStateId(conn, uid, input.state, countryId);

  // name carries the full contact string ("Company, Person" or just "Person").
  // contact_person is the legacy fallback for drafts saved before the single-field UI.
  // Only read from Odoo when both are absent.
  let composedName = input.name || input.contact_person || "";
  if (!composedName) {
    const customerRows = (await odooExecute(conn, uid, "res.partner", "read", [
      [customerPartnerId],
      ["name"],
    ])) as Array<{ name: string }>;
    composedName = customerRows[0]?.name ?? "Address";
  }

  const hasCompanyName = !!input.name;

  const addressVals: Record<string, unknown> = { name: composedName };
  if (input.email)  addressVals.email    = input.email;
  if (input.phone)  addressVals.phone    = input.phone;
  if (input.street) addressVals.street   = input.street;
  if (input.street2) addressVals.street2 = input.street2;
  if (input.city)   addressVals.city     = input.city;
  if (input.zip)    addressVals.zip      = input.zip;
  if (countryId)    addressVals.country_id = countryId;
  if (stateId)      addressVals.state_id   = stateId;

  // ── Delivery to a person (no company name) ────────────────────────────────
  // Create/reuse a STANDALONE partner (no parent_id). Odoo always renders the
  // parent company name first for child contacts, so keeping the person as a
  // standalone is the only reliable way to show just their name in the SO.
  if (type === "delivery" && !hasCompanyName) {
    const standalone = (await odooExecute(conn, uid, "res.partner", "search_read", [
      [["name", "=", composedName], ["parent_id", "=", false], ["type", "=", "delivery"]],
      ["id"],
      0,
      1,
    ])) as Array<{ id: number }>;

    if (standalone.length > 0) {
      await odooExecute(conn, uid, "res.partner", "write", [[standalone[0].id], addressVals]);
      return standalone[0].id;
    }
    const newId = (await odooExecute(conn, uid, "res.partner", "create", [
      { type: "delivery", ...addressVals },
    ])) as number;
    return newId;
  }

  // ── Invoice or delivery WITH company — child partner under customer ───────
  const existing = (await odooExecute(conn, uid, "res.partner", "search_read", [
    [["parent_id", "=", customerPartnerId], ["type", "=", type]],
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;

  if (existing.length > 0) {
    await odooExecute(conn, uid, "res.partner", "write", [[existing[0].id], addressVals]);
    return existing[0].id;
  }

  const newId = (await odooExecute(conn, uid, "res.partner", "create", [
    { parent_id: customerPartnerId, type, ...addressVals },
  ])) as number;
  return newId;
}

// ─── SO tag resolution ────────────────────────────────────────────────────────

async function resolveTagId(
  conn: OdooConnection,
  uid: number,
  tagName: string,
): Promise<number | null> {
  const found = (await odooExecute(conn, uid, "crm.tag", "search_read", [
    [["name", "=", tagName]],
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;
  if (found.length > 0) return found[0].id;

  const newId = (await odooExecute(conn, uid, "crm.tag", "create", [{ name: tagName }])) as number;
  return newId;
}

// ─── Product resolution ───────────────────────────────────────────────────────

async function resolveProductId(
  conn: OdooConnection,
  uid: number,
  sku: string | null,
  description: string,
): Promise<number | false> {
  // context goes in kwargs (6th param of odooExecute), not in args array.
  // active_test:false includes archived products in the search.
  const ctx = { context: { active_test: false } };

  if (sku) {
    // Method 1: exact internal code match (default_code)
    const byCode = (await odooExecute(
      conn,
      uid,
      "product.product",
      "search_read",
      [[["default_code", "=", sku]], ["id"], 0, 1],
      ctx,
    )) as Array<{ id: number }>;
    if (byCode.length > 0) return byCode[0].id;

    // Method 2: barcode match (customer SKU number may be stored as barcode in Odoo)
    const byBarcode = (await odooExecute(
      conn,
      uid,
      "product.product",
      "search_read",
      [[["barcode", "=", sku]], ["id"], 0, 1],
      ctx,
    )) as Array<{ id: number }>;
    if (byBarcode.length > 0) return byBarcode[0].id;

    // Method 3: partial code match (sku contains or starts with default_code)
    const byCodeLike = (await odooExecute(
      conn,
      uid,
      "product.product",
      "search_read",
      [[["default_code", "ilike", sku]], ["id", "default_code"], 0, 5],
      ctx,
    )) as Array<{ id: number; default_code: string }>;
    if (byCodeLike.length === 1) return byCodeLike[0].id;
  }

  // Method 4: product name fuzzy match
  const byName = (await odooExecute(conn, uid, "product.product", "search_read", [
    [["name", "ilike", description.slice(0, 60)]],
    ["id"],
    0,
    1,
  ])) as Array<{ id: number }>;

  return byName.length > 0 ? byName[0].id : false;
}

type ProviderProductMapping = {
  source_sku: string | null;
  source_company_sku: string | null;
  source_description: string | null;
  odoo_product_id: number;
};

function normalizeProductMatch(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveMappedProductId(
  mappings: ProviderProductMapping[],
  sku: string | null,
  description: string | null,
): number | null {
  const normalizedSku = normalizeProductMatch(sku);
  const normalizedDescription = normalizeProductMatch(description);

  if (normalizedSku) {
    const skuMatch = mappings.find((mapping) =>
      [mapping.source_sku, mapping.source_company_sku]
        .map((value) => normalizeProductMatch(value))
        .includes(normalizedSku),
    );
    if (skuMatch?.odoo_product_id) return skuMatch.odoo_product_id;
  }

  if (normalizedDescription) {
    const descriptionMatch = mappings.find(
      (mapping) => normalizeProductMatch(mapping.source_description) === normalizedDescription,
    );
    if (descriptionMatch?.odoo_product_id) return descriptionMatch.odoo_product_id;
  }

  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startedAt = performance.now();

  let payload: OdooSyncPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { order_draft_id: draftId, tenant_id: tenantId } = payload;
  const runId = validUuid(payload.run_id) ? payload.run_id : crypto.randomUUID();

  if (!validUuid(draftId) || !validUuid(tenantId)) {
    return json({ error: "Invalid order_draft_id or tenant_id" }, 400);
  }

  const supabase = createServiceClient();

  // ── 1. Load order draft + lines ───────────────────────────────────────────
  // Select all fields so the DocFlow JSON attachment captures the full state of
  // the draft at sync time. The JSON is the audit/traceability record between
  // DocFlow and Odoo, so it should contain everything the draft has.
  const { data: draft } = await supabase
    .from("order_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!draft) return json({ error: "Order draft not found" }, 404);
  // Idempotency: already synced — skip.
  if (draft.sync_state === "synced") return json({ ok: true, skipped: "already synced" });
  // If SO already created in a previous partial run, we recover from there.
  const existingSoId: number | null = (draft as { odoo_so_id?: number | null }).odoo_so_id ?? null;


  const { data: lines } = await supabase
    .from("order_draft_lines")
    .select("*")
    .eq("order_draft_id", draftId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  // ── Cross-tenant product guard ────────────────────────────────────────────
  // Validate every odoo_product_id present on the lines belongs to THIS tenant's
  // synced Odoo catalog. Defense in depth against tampered order_draft_lines rows.
  //
  // Cuando el catálogo `odoo_products` está desactualizado, los IDs nuevos creados
  // en Odoo después del último sync no aparecen acá y disparan falsos positivos.
  // Política actual: si una línea tiene un odoo_product_id que NO está en nuestra
  // tabla cacheada, limpiamos ese FK (set null) y dejamos que resolveProductId()
  // lo reasigne más adelante consultando Odoo en vivo por SKU/descripción.
  // Mantenemos el evento de auditoría para visibilidad sin abortar el sync.
  const lineProductIds = (lines ?? [])
    .map((l: { odoo_product_id?: number | null }) => l.odoo_product_id)
    .filter((id): id is number => typeof id === "number" && Number.isFinite(id));
  if (lineProductIds.length > 0) {
    const uniqueIds = Array.from(new Set(lineProductIds));
    const { data: tenantProducts } = await supabase
      .from("odoo_products")
      .select("odoo_product_id")
      .eq("tenant_id", tenantId)
      .in("odoo_product_id", uniqueIds);
    const tenantOwned = new Set(
      (tenantProducts ?? []).map((p: { odoo_product_id: number }) => p.odoo_product_id),
    );
    const foreign = uniqueIds.filter((id) => !tenantOwned.has(id));
    if (foreign.length > 0) {
      // Auto-heal: limpiar referencias stale para que el resolver Odoo live actúe.
      await supabase
        .from("order_draft_lines")
        .update({ odoo_product_id: null })
        .eq("tenant_id", tenantId)
        .eq("order_draft_id", draftId)
        .in("odoo_product_id", foreign);

      // Reflejar el cambio en memoria para que el resto del flujo opere con nulls.
      if (lines) {
        for (const ln of lines as Array<{ odoo_product_id?: number | null }>) {
          if (ln.odoo_product_id != null && foreign.includes(ln.odoo_product_id)) {
            ln.odoo_product_id = null;
          }
        }
      }

      await emitWorkflowEvent({
        tenantId,
        documentId: draft.document_id,
        runId,
        stage: "cross_tenant_product_violation",
        outcome: "fail",
        errorCode: "cross_tenant_product_autoheal",
        meta: { draft_id: draftId, foreign_product_ids: foreign },
      });
    }
  }

  const providerProductMappings = validUuid(draft.provider_id)
    ? ((
        await supabase
          .from("provider_product_mappings")
          .select("source_sku, source_company_sku, source_description, odoo_product_id")
          .eq("tenant_id", tenantId)
          .eq("provider_id", draft.provider_id)
      ).data ?? [])
    : [];

  // Load provider settings (attachments config + billing normalization flag)
  const providerSettingsRow = validUuid(draft.provider_id)
    ? ((await supabase.from("providers").select("settings").eq("id", draft.provider_id).maybeSingle()).data)
    : null;
  const providerSettings = (providerSettingsRow?.settings as Record<string, unknown> | null) ?? {};
  type AttachCfg = { enabled?: boolean };
  const attachConfig = (providerSettings.attachments ?? {}) as Record<string, AttachCfg>;
  // Billing-from-reseller is an opt-in for marketplaces (Zoro, Amazon FBM,
  // etc.) where the marketplace is the legal invoicing entity on every
  // order. Default false — the AI extracts the actual bill_to from the
  // document; we trust that and only fall back to the customer partner
  // (not the reseller) when the AI couldn't find one. Set the flag to
  // `true` explicitly in provider settings for marketplaces.
  const useResellerAsBilling = providerSettings.normalize_billing_from_odoo_partner === true;

  // ── 2. Load Odoo connection ───────────────────────────────────────────────
  const { data: connRow } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc, status, export_mode, contact_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!connRow) {
    return json({ error: "No Odoo connection configured" }, 422);
  }
  const exportMode = connRow.export_mode === "quotation" ? "quotation" : "sales_order";
  const contactSettings: ContactSettings = {
    ...DEFAULT_CONTACT_SETTINGS,
    ...((connRow.contact_settings as Partial<ContactSettings> | null) ?? {}),
  };

  // Mark in_progress
  await supabase
    .from("order_drafts")
    .update({ sync_state: "in_progress" })
    .eq("id", draftId)
    .eq("tenant_id", tenantId);

  let connectionErrored = false;
  let syncResolved = false; // tracks whether we have written a terminal state

  try {
    // ── 3. Decrypt & authenticate ─────────────────────────────────────────
    let password: string;
    let uid: number;
    try {
      password = await decrypt(connRow.api_key_enc, secrets.intakeSecretsKey);
      const conn0: OdooConnection = {
        baseUrl: connRow.base_url,
        database: connRow.database,
        username: connRow.username,
        password,
      };
      uid = await odooAuthenticate(conn0);
    } catch (authErr) {
      connectionErrored = true;
      throw authErr;
    }
    const conn: OdooConnection = {
      baseUrl: connRow.base_url,
      database: connRow.database,
      username: connRow.username,
      password,
    };

    // ── 4. Resolve reseller mapping + customer / invoice / delivery ───────
    if (!validUuid(draft.provider_id)) {
      throw new Error("Provider unresolved: document has no provider template");
    }
    const { data: providerResellerMap } = await supabase
      .from("provider_reseller_mappings")
      .select("odoo_partner_id, odoo_partner_name")
      .eq("tenant_id", tenantId)
      .eq("provider_id", draft.provider_id)
      .maybeSingle();
    if (!providerResellerMap?.odoo_partner_id) {
      throw new Error("Provider unresolved: no Odoo reseller mapping");
    }
    const resellerId = await resolveRootCompanyPartnerId(
      conn,
      uid,
      providerResellerMap.odoo_partner_id,
    );
    const resellerTagName: string | null = providerResellerMap.odoo_partner_name ?? null;

    const buyerName =
      draft.buyer &&
      typeof draft.buyer === "object" &&
      !Array.isArray(draft.buyer) &&
      "name" in draft.buyer
        ? String((draft.buyer as Record<string, unknown>).name ?? "")
        : null;
    const buyerEmail = readJsonTextAny(draft.buyer, ["email", "mail"]);
    const buyerPhone = readJsonTextAny(draft.buyer, ["phone", "mobile", "tel"]);
    const buyerVat = readJsonTextAny(draft.buyer, ["vat", "tax_id", "rfc", "nif"]);
    const buyerContactPerson = readJsonTextAny(draft.buyer, [
      "contact_person",
      "additional_name",
      "attention",
      "attn",
    ]);

    // Parse the shipping address first — the recipient name is the actual
    // dropshipping customer (mirrors Shopify/Amazon: Reseller → Customer → Addresses).
    // We do NOT fall back to buyerName here so we can detect the real recipient.
    const shippingAddress = normalizeAddress(draft.shipping_address, {
      email: buyerEmail,
      phone: buyerPhone,
    });

    // Customer resolution — three tiers, in priority order:
    //  1. Shipping company name present  → customer is the company (e.g. a store)
    //     and contact_person is appended ("ACME Corp, Bob Smith").
    //  2. No company but shipping contact_person present → the recipient IS the
    //     customer (e.g. dropship to an individual) → "Victor Roggia" under reseller.
    //  3. Nothing in shipping → fall back to the PO buyer.
    let customerName: string | null;
    let customerContactPerson: string | null;
    if (shippingAddress.name) {
      customerName = shippingAddress.name;
      customerContactPerson = shippingAddress.contact_person || buyerContactPerson;
    } else if (shippingAddress.contact_person) {
      customerName = shippingAddress.contact_person;
      customerContactPerson = null; // already used as the partner name
    } else {
      customerName = buyerName;
      customerContactPerson = buyerContactPerson;
    }
    const customerEmail = shippingAddress.email || buyerEmail;
    const customerPhone = shippingAddress.phone || buyerPhone;

    // Do NOT overwrite shippingAddress.name here — resolveAddressPartnerId needs
    // to see the original empty value to decide whether to create the delivery
    // partner as a standalone (person only) or a child of the customer.

    const customerPartnerId = await resolveCustomerPartnerId(
      conn,
      uid,
      resellerId,
      customerName,
      customerEmail,
      customerPhone,
      buyerVat,
      customerContactPerson,
      draft.customer_mapping_id,
      supabase,
      tenantId,
      contactSettings,
    );

    // ── Billing address resolution ────────────────────────────────────────
    // Both delivery and invoice are stored as children of the customer partner
    // (mirrors the Andrea Charron / THD reference structure).
    //
    // Resolution priority (top wins):
    //   1. Marketplace opt-in (`normalize_billing_from_odoo_partner = true`):
    //      billing = the reseller partner in Odoo. Used for Zoro / Amazon /
    //      Walmart Marketplace where the legal billing entity on every
    //      invoice is the marketplace itself, not the consumer.
    //   2. AI-extracted billing from the PDF — the default path. If the
    //      AI found a real geographic address (street/city/state/zip),
    //      use it. This is what the operator actually wants for any
    //      direct B2B invoice.
    //   3. Customer-partner fallback. AI didn't extract anything useful
    //      → read the customer partner record from Odoo and use its
    //      address. We deliberately do NOT fall back to the reseller
    //      here — that was the original bug (S09905: customer
    //      "Selvaggi Built" sync'd with DocFlow as billing).
    let billingAddress: AddressInput;
    let billingSource: "reseller" | "ai" | "customer_partner" = "ai";

    if (useResellerAsBilling) {
      const partnerRows = (await odooExecute(conn, uid, "res.partner", "read", [
        [resellerId],
        ["name", "street", "street2", "city", "zip", "state_id", "country_id", "email", "phone"],
      ])) as Array<{
        name: string;
        street: string | false;
        street2: string | false;
        city: string | false;
        zip: string | false;
        state_id: [number, string] | false;
        country_id: [number, string] | false;
        email: string | false;
        phone: string | false;
      }>;
      const p = partnerRows[0];
      billingAddress = {
        name: p?.name ?? null,
        contact_person: null,
        email: p?.email || null,
        phone: p?.phone || null,
        street: p?.street || null,
        street2: p?.street2 || null,
        city: p?.city || null,
        zip: p?.zip || null,
        state: p && Array.isArray(p.state_id) ? p.state_id[1] : null,
        country: p && Array.isArray(p.country_id) ? p.country_id[1] : null,
      };
      billingSource = "reseller";

      // Back-fill the draft only on the marketplace path — that's where
      // we want the audit trail "billing intentionally came from Odoo".
      // The default path leaves draft.billing_address untouched so the
      // original AI extraction is preserved for inspection.
      if (p) {
        try {
          await supabase
            .from("order_drafts")
            .update({
              billing_address: {
                name: p.name ?? null,
                street: p.street || null,
                line1: p.street || null,
                line2: p.street2 || null,
                city: p.city || null,
                state: Array.isArray(p.state_id) ? p.state_id[1] : null,
                zip: p.zip || null,
                country: Array.isArray(p.country_id) ? p.country_id[1] : null,
                email: p.email || null,
                phone: p.phone || null,
                _source: "odoo_partner",
              },
            })
            .eq("id", draftId)
            .eq("tenant_id", tenantId);
        } catch (err) {
          console.warn("[odoo-sync] Could not back-fill billing_address from Odoo partner:", err);
        }
      }
    } else {
      // Default path: trust the AI extraction first.
      const aiBilling = normalizeAddress(draft.billing_address, {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        street: readJsonTextAny(draft.buyer, ["address"]),
      });
      const aiHasGeo = !!(
        aiBilling.street || aiBilling.city || aiBilling.state || aiBilling.zip
      );
      if (aiHasGeo) {
        billingAddress = aiBilling;
        billingSource = "ai";
      } else {
        // No useful billing in the document — read the customer partner
        // record from Odoo (NOT the reseller) and use its address as
        // the fallback billing.
        const cp = (await odooExecute(conn, uid, "res.partner", "read", [
          [customerPartnerId],
          ["name", "street", "street2", "city", "zip", "state_id", "country_id", "email", "phone"],
        ])) as Array<{
          name: string;
          street: string | false;
          street2: string | false;
          city: string | false;
          zip: string | false;
          state_id: [number, string] | false;
          country_id: [number, string] | false;
          email: string | false;
          phone: string | false;
        }>;
        const cpRow = cp[0];
        billingAddress = {
          name: cpRow?.name ?? customerName ?? null,
          contact_person: null,
          email: cpRow?.email || customerEmail || null,
          phone: cpRow?.phone || customerPhone || null,
          street: cpRow?.street || null,
          street2: cpRow?.street2 || null,
          city: cpRow?.city || null,
          zip: cpRow?.zip || null,
          state: cpRow && Array.isArray(cpRow.state_id) ? cpRow.state_id[1] : null,
          country: cpRow && Array.isArray(cpRow.country_id) ? cpRow.country_id[1] : null,
        };
        billingSource = "customer_partner";
      }
    }
    console.log(`[odoo-sync] billing source for draft ${draftId}: ${billingSource}`);

    const hasExplicitBillingGeo = !!(
      billingAddress.street ||
      billingAddress.city ||
      billingAddress.state ||
      billingAddress.zip
    );

    const partnerInvoiceId =
      contactSettings.sync_billing_address && hasExplicitBillingGeo
        ? await resolveAddressPartnerId(
            conn,
            uid,
            customerPartnerId,
            "invoice",
            billingAddress,
            contactSettings.address_update_strategy,
          )
        : customerPartnerId;

    const partnerShippingId = contactSettings.sync_shipping_address
      ? await resolveAddressPartnerId(
          conn,
          uid,
          customerPartnerId,
          "delivery",
          shippingAddress,
          contactSettings.address_update_strategy,
        )
      : customerPartnerId;

    // ── 5. Resolve currency ───────────────────────────────────────────────
    let currencyId: number | false = false;
    if (draft.currency) {
      const currencies = (await odooExecute(conn, uid, "res.currency", "search_read", [
        [["name", "=", draft.currency]],
        ["id"],
        0,
        1,
      ])) as Array<{ id: number }>;
      if (currencies.length > 0) currencyId = currencies[0].id;
    }

    // ── 5b. Resolve payment term ──────────────────────────────────────────
    const rawPaymentTerms = (draft as Record<string, unknown>).payment_terms;
    const rawTermsStr = typeof rawPaymentTerms === "string" ? rawPaymentTerms.trim() : null;
    // Normalize: "2%/30 NET 45" → "2% 30 NET 45" so it matches Odoo's stored format.
    const paymentTermsName = rawTermsStr
      ? rawTermsStr
          .replace(/\//g, " ")
          .replace(/\s{2,}/g, " ")
          .trim()
      : null;
    let paymentTermId: number | null = null;
    if (paymentTermsName) {
      // Try exact normalized match first, then ilike
      const trySearch = async (q: string) =>
        (await odooExecute(conn, uid, "account.payment.term", "search_read", [
          [["name", "ilike", q]],
          ["id", "name"],
          0,
          5,
        ])) as Array<{ id: number; name: string }>;

      let termRows = await trySearch(paymentTermsName);
      // If no match, try stripping the discount prefix (e.g. "2% 30" → "NET 45")
      if (!termRows.length && /net\s+\d+/i.test(paymentTermsName)) {
        const netPart = paymentTermsName.match(/net\s+\d+/i)?.[0] ?? "";
        if (netPart) termRows = await trySearch(netPart);
      }
      if (termRows.length > 0) paymentTermId = termRows[0].id;
    }

    // ── 5c. Resolve SO tag (reseller name) ───────────────────────────────
    let resellerTagId: number | null = null;
    if (resellerTagName) {
      resellerTagId = await resolveTagId(conn, uid, resellerTagName).catch(() => null);
    }

    // ── 6. Create Sale Order (idempotent: reuse if already created) ───────
    let soId: number;
    if (existingSoId) {
      // Previous partial run already created the SO — resume from here.
      soId = existingSoId;
      console.log(`[odoo-sync] Resuming with existing SO id=${soId}`);
    } else {
      const orderVals: Record<string, unknown> = {
        partner_id: customerPartnerId,
        partner_invoice_id: partnerInvoiceId,
        partner_shipping_id: partnerShippingId,
        client_order_ref: draft.po_number ?? undefined,
        note: draft.notes ?? undefined,
      };
      if (currencyId) orderVals.currency_id = currencyId;
      if (paymentTermId) orderVals.payment_term_id = paymentTermId;
      if (resellerTagId) orderVals.tag_ids = [[4, resellerTagId]];
      if (draft.po_date) orderVals.date_order = `${draft.po_date} 00:00:00`;
      if ((draft as { delivery_date?: string | null }).delivery_date)
        orderVals.commitment_date = `${(draft as { delivery_date: string }).delivery_date} 00:00:00`;

      soId = (await odooExecute(conn, uid, "sale.order", "create", [orderVals])) as number;

      // Persist SO id immediately so a retry can reuse it rather than duplicating.
      await supabase
        .from("order_drafts")
        .update({ odoo_so_id: soId })
        .eq("id", draftId)
        .eq("tenant_id", tenantId);
    }

    // ── 7. Create order lines ─────────────────────────────────────────────
    // Read back existing lines from Odoo to avoid duplication on retry.
    const existingLines = (await odooExecute(conn, uid, "sale.order.line", "search_read", [
      [["order_id", "=", soId]],
      ["id"],
      0,
      500,
    ])) as Array<{ id: number }>;
    const needsLines = existingLines.length === 0;

    if (needsLines) {
      // line_kind_products del provider: mapea kinds no-item a productos especiales
      // pre-creados en Odoo (ej. { discount: 123, freight: 456 }). Si una línea
      // no-item entra y no hay product configurado para su kind, fallback a
      // tratarla como item (resolución normal de SKU) — para no romper el sync.
      const kindProducts = (providerSettings.line_kind_products ?? {}) as Record<string, number | undefined>;

      for (const line of lines ?? []) {
        const lineKind = (line as { kind?: string }).kind ?? "item";
        let productId: number | null = null;

        if (lineKind !== "item") {
          const specialProductId = kindProducts[lineKind];
          if (typeof specialProductId === "number" && Number.isFinite(specialProductId)) {
            productId = specialProductId;
          } else {
            console.warn(
              `[odoo-sync] line kind="${lineKind}" without product configured in providerSettings.line_kind_products; falling back to item resolution`,
            );
          }
        }

        if (productId === null) {
          const mappedProductId = resolveMappedProductId(
            providerProductMappings,
            line.sku ?? null,
            line.description ?? null,
          );
          productId =
            line.odoo_product_id ||
            mappedProductId ||
            (await resolveProductId(conn, uid, line.sku ?? null, line.description ?? ""));
        }

        if (!productId) {
          const lineRef =
            line.sku?.trim() || line.description?.trim() || `line ${line.position ?? "?"}`;
          throw new Error(
            `Some order lines are missing a product. Resolve the SKU mapping for "${lineRef}" before approving.`,
          );
        }

        const lineVals = buildSaleOrderLineVals({
          soId,
          productId,
          line: {
            ...line,
            kind: lineKind as "item" | "discount" | "freight" | "surcharge" | "adjustment",
          },
        });
        await odooExecute(conn, uid, "sale.order.line", "create", [lineVals]);
      }
    }

    // In quotation mode we keep the draft quote. Sales-order mode confirms immediately.
    if (exportMode === "sales_order") {
      await odooExecute(conn, uid, "sale.order", "action_confirm", [[soId]]);
    }

    // ── 8. Read back SO reference ─────────────────────────────────────────
    const soData = (await odooExecute(conn, uid, "sale.order", "read", [
      [soId],
      ["name", "amount_total"],
    ])) as Array<{ name: string; amount_total: number }>;
    const soName = soData[0]?.name ?? `SO-${soId}`;

    // ── 9. Attach documents to the Sale Order in Odoo ───────────────────
    // Best-effort: failures do not block the sync.
    // Which documents to attach is configured per provider in settings.attachments.
    // Default: only the original document is attached (attachConfig.original.enabled defaults to true).

    // 9a. DocFlow sync record — always attached for traceability.
    // Includes the full draft + lines + linked records (document, provider,
    // reseller mapping, customer mapping) so the JSON is a complete audit
    // record of what DocFlow sent to Odoo at sync time.
    try {
      const draftRecord = draft as Record<string, unknown>;

      // Load source document metadata
      let documentMeta: Record<string, unknown> | null = null;
      try {
        const { data: docRow } = await supabase
          .from("documents")
          .select("id, original_name, mime_type, storage_path, source_channel, created_at")
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        if (docRow) documentMeta = docRow as Record<string, unknown>;
      } catch (err) {
        // Non-fatal but still useful to know which lookup is failing.
        console.warn("[odoo-sync] documentMeta lookup failed:", err);
      }

      // Load provider info
      let providerMeta: Record<string, unknown> | null = null;
      try {
        if (validUuid(draft.provider_id)) {
          const { data: provRow } = await supabase
            .from("providers")
            .select("id, name, slug")
            .eq("id", draft.provider_id)
            .maybeSingle();
          if (provRow) providerMeta = provRow as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("[odoo-sync] providerMeta lookup failed:", err);
      }

      // Load customer mapping if used
      let customerMappingMeta: Record<string, unknown> | null = null;
      try {
        const cmId = draftRecord.customer_mapping_id;
        if (typeof cmId === "string" && validUuid(cmId)) {
          const { data: cmRow } = await supabase
            .from("customer_mappings")
            .select("id, source_name, odoo_partner_id")
            .eq("id", cmId)
            .maybeSingle();
          if (cmRow) customerMappingMeta = cmRow as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("[odoo-sync] customerMappingMeta lookup failed:", err);
      }

      const sdmRecord = {
        sdm_version: "1.1",
        synced_at: new Date().toISOString(),
        run_id: runId,
        action: "sync",
        odoo: {
          so_id: soId,
          so_name: soName,
          customer_partner_id: customerPartnerId,
          partner_invoice_id: partnerInvoiceId,
          partner_shipping_id: partnerShippingId,
          reseller_partner_id: resellerId,
          reseller_tag: resellerTagName,
          export_mode: exportMode,
        },
        draft: draftRecord,
        lines: lines ?? [],
        document: documentMeta,
        provider: providerMeta,
        customer_mapping: customerMappingMeta,
      };
      const jsonBytes = new TextEncoder().encode(JSON.stringify(sdmRecord, null, 2));
      let jsonBin = "";
      for (let i = 0; i < jsonBytes.length; i++) jsonBin += String.fromCharCode(jsonBytes[i]);
      const poRef = draft.po_number ? String(draft.po_number).replace(/[^A-Za-z0-9_-]/g, "-") : draft.id;
      await odooExecute(conn, uid, "ir.attachment", "create", [
        {
          name: `DocFlow-${poRef}.json`,
          res_model: "sale.order",
          res_id: soId,
          type: "binary",
          datas: btoa(jsonBin),
          mimetype: "application/json",
        },
      ]);
    } catch (err) {
      // Non-fatal — traceability record failure must not break the sync
      console.warn("[odoo-sync] DocFlow JSON attachment failed:", err);
    }

    // 9b. Original document (enabled by default, can be disabled)
    if (attachConfig.original?.enabled !== false) {
      try {
        const { data: docRow } = await supabase
          .from("documents")
          .select("storage_path, original_name, mime_type")
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (docRow?.storage_path) {
          const { data: fileBlob, error: dlErr } = await supabase.storage
            .from("documents")
            .download(docRow.storage_path);

          if (!dlErr && fileBlob) {
            const arrayBuffer = await fileBlob.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
            const b64 = btoa(binary);

            await odooExecute(conn, uid, "ir.attachment", "create", [
              {
                name: docRow.original_name ?? "purchase-order.pdf",
                res_model: "sale.order",
                res_id: soId,
                type: "binary",
                datas: b64,
                mimetype: docRow.mime_type ?? "application/pdf",
              },
            ]);
          }
        }
      } catch (err) {
        // Non-fatal
        console.warn("[odoo-sync] original document attachment failed:", err);
      }
    }

    // 9c. Configured additional PDFs (PO PDF, Packing Slip) — generated on-demand
    const appUrl = Deno.env.get("INTAKE_PUBLIC_APP_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const poNum = String(draft.po_number ?? id);

    if (appUrl && serviceKey) {
      const renderDocs: Array<{ type: string; filename: string; configKey: string }> = [
        { type: "po_pdf", filename: `PO-${poNum}.pdf`, configKey: "po_pdf" },
        { type: "packing_slip", filename: `packing-slip-${poNum}.pdf`, configKey: "packing_slip" },
      ];

      for (const doc of renderDocs) {
        if (!attachConfig[doc.configKey]?.enabled) continue;
        try {
          const res = await fetch(
            `${appUrl}/api/internal/render-doc?type=${doc.type}&draft_id=${id}&tenant_id=${tenantId}`,
            { headers: { Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(55_000) },
          );
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          const uint8b = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < uint8b.length; i++) bin += String.fromCharCode(uint8b[i]);
          await odooExecute(conn, uid, "ir.attachment", "create", [
            {
              name: doc.filename,
              res_model: "sale.order",
              res_id: soId,
              type: "binary",
              datas: btoa(bin),
              mimetype: "application/pdf",
            },
          ]);
        } catch (err) {
          // Non-fatal — render of optional PDFs (PO / Packing Slip) failed.
          console.warn(`[odoo-sync] render ${doc.type} attachment failed:`, err);
        }
      }
    }

    // ── 9d. Packing slip del proveedor → csf_packing_list_attachment_id ──
    // Si el email del proveedor traía un packing slip adjunto
    // (source_meta.is_packing_slip:true, detectado vía
    // settings.email_ingest.packing_slip_filename_patterns), subirlo a Odoo
    // y asignarlo al campo COF. Sin esto la SO queda en "Esperando Docs"
    // hasta que un operador suba el archivo a mano.
    // Mirror de la lógica de odoo-export/index.ts:346.
    if (exportMode === "sales_order" && draft.document_id) {
      try {
        const { data: mainDoc } = await supabase
          .from("documents")
          .select("source_ref")
          .eq("id", draft.document_id)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const inboundEmailId = (mainDoc as { source_ref?: string } | null)?.source_ref ?? null;

        if (inboundEmailId) {
          const { data: siblingDocs } = await supabase
            .from("documents")
            .select("id, storage_path, original_name, mime_type, source_meta")
            .eq("tenant_id", tenantId)
            .eq("source_ref", inboundEmailId)
            .neq("id", draft.document_id);

          // Filtrar en JS — el filtro JSONB en PostgREST trata booleanos como string.
          const packingSlips = (siblingDocs ?? []).filter((d) => {
            const meta = (d as { source_meta?: Record<string, unknown> }).source_meta ?? null;
            return meta?.is_packing_slip === true || meta?.is_packing_slip === "true";
          });

          console.log(
            `[odoo-sync] COF: found ${packingSlips.length} packing slip(s) for email ${inboundEmailId} (siblings total: ${(siblingDocs ?? []).length})`,
          );

          for (const psDoc of packingSlips) {
            try {
              const doc = psDoc as {
                id: string;
                storage_path: string | null;
                original_name: string | null;
                mime_type: string | null;
              };
              if (!doc.storage_path) continue;

              let psFile = (await supabase.storage.from("documents").download(doc.storage_path)).data;

              if (!psFile) {
                const { data: attRow } = await supabase
                  .from("inbound_email_attachments")
                  .select("storage_path")
                  .eq("document_id", doc.id)
                  .maybeSingle();
                const fallbackPath = (attRow as { storage_path?: string } | null)?.storage_path;
                if (fallbackPath) {
                  psFile = (await supabase.storage.from("documents").download(fallbackPath)).data;
                  console.log(`[odoo-sync] COF: fallback storage_path used for ${doc.id}`);
                }
              }

              if (!psFile) {
                console.error(`[odoo-sync] COF: could not download packing slip ${doc.id}`);
                continue;
              }

              const psBytes = await psFile.arrayBuffer();
              const psUint = new Uint8Array(psBytes);
              let psBin = "";
              for (let i = 0; i < psUint.length; i++) psBin += String.fromCharCode(psUint[i]);
              const psBase64 = btoa(psBin);
              const psName = doc.original_name ?? "PackingSlip.pdf";

              const psAttachmentId = (await odooExecute(conn, uid, "ir.attachment", "create", [
                {
                  name: psName,
                  type: "binary",
                  datas: psBase64,
                  res_model: "sale.order",
                  res_id: soId,
                  mimetype: doc.mime_type ?? "application/pdf",
                },
              ])) as number;

              // Asignar al campo COF — esto dispara el flujo waiting_docs → ready
              // y deja la orden lista para warehouse automáticamente.
              await odooExecute(conn, uid, "sale.order", "write", [
                [soId],
                { csf_packing_list_attachment_id: psAttachmentId },
              ]);

              console.log(
                `[odoo-sync] COF: packing slip "${psName}" attached to sale.order #${soId} (attachment #${psAttachmentId})`,
              );

              await supabase
                .from("documents")
                .update({ state: "reviewed" })
                .eq("id", doc.id)
                .eq("tenant_id", tenantId);
            } catch (psErr) {
              console.error(
                "[odoo-sync] COF packing slip attach failed:",
                psErr instanceof Error ? psErr.message : psErr,
              );
            }
          }
        }
      } catch (cofErr) {
        // Non-fatal — un error acá no debe abortar el sync entero.
        console.error(
          "[odoo-sync] COF packing slip lookup failed:",
          cofErr instanceof Error ? cofErr.message : cofErr,
        );
      }
    }

    // ── 10. Persist result ────────────────────────────────────────────────
    syncResolved = true;
    await supabase
      .from("order_drafts")
      .update({
        sync_state: "synced",
        odoo_so_id: soId,
        odoo_so_name: soName,
        last_sync_error: null,
      })
      .eq("id", draftId)
      .eq("tenant_id", tenantId);

    await supabase.from("odoo_sync_attempts").insert({
      tenant_id: tenantId,
      order_draft_id: draftId,
      run_id: runId,
      outcome: "success",
      odoo_so_id: soId,
      odoo_so_name: soName,
      error_message: null,
    });

    await supabase
      .from("odoo_connections")
      .update({ last_checked_at: new Date().toISOString(), last_error: null, status: "active" })
      .eq("tenant_id", tenantId);

    const durationMs = Math.round(performance.now() - startedAt);

    await emitWorkflowEvent({
      tenantId,
      documentId: draft.document_id,
      runId,
      stage: "odoo_sync",
      outcome: "ok",
      durationMs,
      meta: { odoo_so_id: soId, odoo_so_name: soName, export_mode: exportMode },
    });

    return json({ ok: true, odoo_so_id: soId, odoo_so_name: soName, duration_ms: durationMs });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Math.round(performance.now() - startedAt);

    syncResolved = true;
    await supabase
      .from("order_drafts")
      .update({ sync_state: "sync_failed", last_sync_error: errorMessage.slice(0, 500) })
      .eq("id", draftId)
      .eq("tenant_id", tenantId);

    await supabase.from("odoo_sync_attempts").insert({
      tenant_id: tenantId,
      order_draft_id: draftId,
      run_id: runId,
      outcome: "error",
      odoo_so_id: null,
      odoo_so_name: null,
      error_message: errorMessage.slice(0, 1000),
    });

    if (connectionErrored) {
      await supabase
        .from("odoo_connections")
        .update({ last_error: errorMessage.slice(0, 500), status: "error" })
        .eq("tenant_id", tenantId);
    }

    await emitWorkflowEvent({
      tenantId,
      documentId: draft.document_id,
      runId,
      stage: "odoo_sync",
      outcome: "fail",
      durationMs,
      errorCode: "odoo_sync_error",
      meta: { error: errorMessage.slice(0, 200) },
    });

    console.error(`[odoo-sync] ${draftId} failed:`, err);
    const status = errorMessage.toLowerCase().includes("missing a product") ? 422 : 500;
    return json({ error: "Odoo sync failed", detail: errorMessage }, status);
  } finally {
    // Safety net: if we somehow exit without resolving state (e.g. Edge Function
    // killed mid-execution), ensure the draft never stays stuck in "in_progress".
    if (!syncResolved) {
      await supabase
        .from("order_drafts")
        .update({
          sync_state: "sync_failed",
          last_sync_error: "Sync interrupted — safe to retry",
        })
        .eq("id", draftId)
        .eq("tenant_id", tenantId)
        .catch(() => {}); // best-effort, cannot throw in finally
    }
  }
});
