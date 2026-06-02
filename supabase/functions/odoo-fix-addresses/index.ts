import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { secrets } from "../_shared/secrets.ts";
import { decrypt } from "../_shared/crypto.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}
function rawId(field: unknown): number | null {
  if (!field) return null;
  if (Array.isArray(field)) return typeof field[0] === "number" ? field[0] : null;
  return typeof field === "number" ? field : null;
}

// ─── Address parser ───────────────────────────────────────────────────────────

const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","VI","GU","AS","MP",
]);

const CA_PROVINCE_CODES = new Set([
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
]);

const CA_POSTAL_RE = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;
const US_ZIP_RE    = /^\d{5}(?:-\d{4})?$/;

// USPS 3-digit ZIP prefix → state. >99% coverage of US ZIP codes.
const US_ZIP3_RANGES: ReadonlyArray<readonly [string, string, string]> = [
  ["005","005","NY"], ["006","009","PR"], ["010","027","MA"],
  ["028","029","RI"], ["030","038","NH"], ["039","049","ME"],
  ["050","054","VT"], ["055","055","MA"], ["056","059","VT"],
  ["060","069","CT"], ["070","089","NJ"], ["100","149","NY"],
  ["150","196","PA"], ["197","199","DE"], ["200","205","DC"],
  ["206","219","MD"], ["220","246","VA"], ["247","268","WV"],
  ["270","289","NC"], ["290","299","SC"], ["300","319","GA"],
  ["320","349","FL"], ["350","369","AL"], ["370","385","TN"],
  ["386","397","MS"], ["398","399","GA"], ["400","427","KY"],
  ["430","459","OH"], ["460","479","IN"], ["480","499","MI"],
  ["500","528","IA"], ["530","549","WI"], ["550","567","MN"],
  ["570","577","SD"], ["580","588","ND"], ["590","599","MT"],
  ["600","629","IL"], ["630","658","MO"], ["660","679","KS"],
  ["680","693","NE"], ["700","714","LA"], ["716","729","AR"],
  ["730","749","OK"], ["750","799","TX"], ["800","816","CO"],
  ["820","831","WY"], ["832","838","ID"], ["840","847","UT"],
  ["850","865","AZ"], ["870","884","NM"], ["885","885","TX"],
  ["889","898","NV"], ["900","961","CA"], ["967","968","HI"],
  ["970","979","OR"], ["980","994","WA"], ["995","999","AK"],
];

const CA_POSTAL_LETTER_TO_PROVINCE: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB",
  G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC",
  X: "NT", Y: "YT",
};

function inferStateFromZip(zip: string | null): string | null {
  const z = (zip ?? "").trim();
  if (!z) return null;
  if (US_ZIP_RE.test(z)) {
    const zip3 = z.slice(0, 3);
    for (const [lo, hi, code] of US_ZIP3_RANGES) {
      if (zip3 >= lo && zip3 <= hi) return code;
    }
    return null;
  }
  if (CA_POSTAL_RE.test(z)) {
    return CA_POSTAL_LETTER_TO_PROVINCE[z[0].toUpperCase()] ?? null;
  }
  return null;
}

function inferCountry(state: string | null, zip: string | null): string | null {
  // ZIP/postal pattern is the strongest signal — try it first.
  if (zip) {
    const z = zip.trim();
    if (/^\d{5}(?:-\d{4})?$/.test(z)) return "United States";
    if (CA_POSTAL_RE.test(z)) return "Canada";
  }
  if (state) {
    const s = state.trim().toUpperCase();
    if (US_STATE_CODES.has(s)) return "United States";
    if (CA_PROVINCE_CODES.has(s)) return "Canada";
  }
  return null;
}

function looksLikeStreetSegment(s: string): boolean {
  return (
    /\d/.test(s) ||
    /\bP\.?O\.?\s*BOX\b/i.test(s) ||
    /\b(BLVD|BOULEVARD|AVE|AVENUE|ROAD|DRIVE|LANE|WAY|HWY|HIGHWAY|ROUTE|PKWY|PARKWAY|COURT|PLACE|CIRCLE|LOOP|TRAIL|SUITE|APT|UNIT|FLOOR)\b/i.test(s) ||
    /\b(RD|DR|LN|ST|CT|PL|CIR|TRL|STE|FL)\b/.test(s)
  );
}

const TRAILING_COUNTRY_RE =
  /^(united states(?: of america)?|u\.s\.a?\.?|usa|us|canada|ca|mexico|mx|uk|united kingdom|great britain|gb|australia|au|germany|de|france|fr|spain|es|japan|jp|china|cn|brazil|br|india|in)$/i;

type AddressInput = {
  name: string | null; email: string | null; phone: string | null;
  street: string | null; street2: string | null; city: string | null;
  zip: string | null; state: string | null; country: string | null;
};

function parseAddressBlock(block: string): Partial<AddressInput> {
  const trimmed = block.trim();
  if (!trimmed) return {};
  const byLine = trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let segs = byLine.length >= 2
    ? byLine
    : trimmed.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (segs.length === 0) return {};
  if (segs.length === 1) return { street: segs[0] };

  let name: string | null = null, city: string | null = null;
  let state: string | null = null, zip: string | null = null, country: string | null = null;

  if (segs.length > 1 && TRAILING_COUNTRY_RE.test(segs[segs.length - 1])) {
    country = segs[segs.length - 1];
    segs = segs.slice(0, -1);
  }
  const stateZipRe = /^([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;
  const cityStateZipRe = /^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)(?:\s+([A-Za-z].*))?$/;
  const lastSeg = segs[segs.length - 1];
  const csz = lastSeg.match(cityStateZipRe);
  const sz = !csz ? lastSeg.match(stateZipRe) : null;
  if (csz) {
    city = csz[1].trim() || null; state = csz[2].toUpperCase(); zip = csz[3];
    if (!country) country = csz[4]?.trim() || null;
    segs = segs.slice(0, -1);
  } else if (sz) {
    state = sz[1].toUpperCase(); zip = sz[2];
    if (!country) country = sz[3]?.trim() || null;
    segs = segs.slice(0, -1);
    if (segs.length > 0) {
      const maybeCity = segs[segs.length - 1];
      if (!looksLikeStreetSegment(maybeCity) && !TRAILING_COUNTRY_RE.test(maybeCity)) {
        city = maybeCity; segs = segs.slice(0, -1);
      }
    }
  }
  if (segs.length >= 2 && !looksLikeStreetSegment(segs[0])) {
    name = segs[0]; segs = segs.slice(1);
  }
  return { name, street: segs.join(", ") || null, city, state, zip,
           country: country ?? inferCountry(state, zip) };
}

function readJsonTextAny(value: unknown, keys: string[]): string | null {
  for (const key of keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function normalizeAddress(raw: unknown, fallback: Partial<AddressInput> = {}): AddressInput {
  if (typeof raw === "string") {
    const p = parseAddressBlock(raw.trim());
    return { name: p.name ?? fallback.name ?? null, email: fallback.email ?? null,
             phone: fallback.phone ?? null, street: p.street ?? null, street2: null,
             city: p.city ?? null, zip: p.zip ?? null, state: p.state ?? null,
             country: p.country ?? fallback.country ?? null };
  }
  const f = {
    name: readJsonTextAny(raw, ["name","full_name","recipient","contact_name"]),
    email: readJsonTextAny(raw, ["email","mail"]),
    phone: readJsonTextAny(raw, ["phone","mobile","tel"]),
    street: readJsonTextAny(raw, ["line1","street","address","address1"]),
    street2: readJsonTextAny(raw, ["line2","street2","address2"]),
    city: readJsonTextAny(raw, ["city","town"]),
    zip: readJsonTextAny(raw, ["zip","postal_code","postcode"]),
    state: readJsonTextAny(raw, ["state","state_name","province","region"]),
    country: readJsonTextAny(raw, ["country","country_name"]),
  };
  const hasExplicit = !!(f.city || f.state || f.zip);
  if (!hasExplicit && f.street) {
    const p = parseAddressBlock(f.street);
    // Prefer the explicit JSON name (f.name) over the one parsed out of the
    // address string. This matters when the JSON looks like
    // { name: "Ellen Paul", line1: "112 Mount Rd, Cummington, MA 01026, US" }
    // — the recipient name lives in the JSON, not inside the address string.
    return { name: f.name ?? p.name ?? fallback.name ?? null,
             email: f.email ?? fallback.email ?? null,
             phone: f.phone ?? fallback.phone ?? null, street: p.street ?? null,
             street2: f.street2 ?? null, city: p.city ?? null, zip: p.zip ?? null,
             state: p.state ?? null, country: f.country ?? p.country ?? fallback.country ?? null };
  }
  const resolvedCountry = f.country ?? fallback.country ??
    inferCountry(f.state ?? fallback.state ?? null, f.zip ?? fallback.zip ?? null);
  return { name: f.name ?? fallback.name ?? null, email: f.email ?? fallback.email ?? null,
           phone: f.phone ?? fallback.phone ?? null, street: f.street ?? fallback.street ?? null,
           street2: f.street2 ?? null, city: f.city ?? fallback.city ?? null,
           zip: f.zip ?? fallback.zip ?? null, state: f.state ?? fallback.state ?? null,
           country: resolvedCountry };
}

// ─── Odoo RPC client ──────────────────────────────────────────────────────────

interface OdooConnection { baseUrl: string; database: string; username: string; password: string; }
const ODOO_TIMEOUT_MS = 30_000;
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);

async function odooCallOnce(conn: OdooConnection, service: string, method: string, args: unknown[]): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ODOO_TIMEOUT_MS);
  try {
    const res = await fetch(`${conn.baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", id: Math.floor(Math.random() * 1e5),
                             params: { service, method, args } }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`Odoo HTTP ${res.status}`), { httpStatus: res.status });
    const body = (await res.json()) as { result?: unknown; error?: { data?: { message?: string } } };
    if (body.error) throw new Error(body.error.data?.message ?? "Odoo RPC error");
    return body.result;
  } finally { clearTimeout(t); }
}

async function odooCall(conn: OdooConnection, service: string, method: string, args: unknown[]): Promise<unknown> {
  try { return await odooCallOnce(conn, service, method, args); }
  catch (err) {
    const isTransient = err instanceof Error && (
      ("httpStatus" in err && TRANSIENT_HTTP.has((err as { httpStatus?: number }).httpStatus ?? 0)) ||
      err.name === "AbortError" || err.message.includes("fetch failed")
    );
    if (isTransient) { await new Promise((r) => setTimeout(r, 1500)); return await odooCallOnce(conn, service, method, args); }
    throw err;
  }
}

async function odooExecute(conn: OdooConnection, uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> {
  return odooCall(conn, "object", "execute_kw", [conn.database, uid, conn.password, model, method, args, kwargs]);
}

async function odooAuthenticate(conn: OdooConnection): Promise<number> {
  const uid = await odooCall(conn, "common", "authenticate", [conn.database, conn.username, conn.password, {}]);
  if (typeof uid !== "number" || uid === 0) throw new Error("Odoo authentication failed");
  return uid;
}

// ─── Geo resolution ───────────────────────────────────────────────────────────

async function resolveCountryId(conn: OdooConnection, uid: number, country: string | null): Promise<{ id: number; name: string } | null> {
  if (!country) return null;
  const c = country.trim();
  if (!c) return null;
  // 1) Exact name match (e.g., "United States", "Canada")
  let found = (await odooExecute(conn, uid, "res.country", "search_read",
    [[["name", "=", c]], ["id", "name"], 0, 1])) as Array<{ id: number; name: string }>;
  if (found[0]) return found[0];
  // 2) Exact code match for 2/3-letter inputs (e.g., "US", "CA", "USA")
  if (/^[A-Za-z]{2,3}$/.test(c)) {
    found = (await odooExecute(conn, uid, "res.country", "search_read",
      [[["code", "=", c.toUpperCase()]], ["id", "name"], 0, 1])) as Array<{ id: number; name: string }>;
    if (found[0]) return found[0];
  }
  // 3) Last resort: ilike — but only for long-enough strings, and only return
  //    if the match isn't ambiguous (e.g., "AU" matching Australia when we
  //    actually wanted "Austria" would be a problem — but at length ≥ 4 most
  //    country names are unique enough).
  if (c.length >= 4) {
    found = (await odooExecute(conn, uid, "res.country", "search_read",
      [[["name", "ilike", c]], ["id", "name"], 0, 1])) as Array<{ id: number; name: string }>;
    if (found[0]) return found[0];
  }
  return null;
}

async function resolveStateId(conn: OdooConnection, uid: number, state: string | null, countryId: number | null): Promise<number | null> {
  if (!state) return null;
  const codeLike = /^[A-Za-z]{2,3}$/.test(state.trim());
  // Prefer code match (exact) when state looks like a 2-3 letter code; fall back to name (ilike).
  const domain: unknown[] = codeLike
    ? [[ "code", "=", state.trim().toUpperCase() ]]
    : [[ "name", "ilike", state.trim() ]];
  if (countryId) domain.push(["country_id", "=", countryId]);
  const found = (await odooExecute(conn, uid, "res.country.state", "search_read",
    [domain, ["id"], 0, 1])) as Array<{ id: number }>;
  return found[0]?.id ?? null;
}

async function buildAddressVals(conn: OdooConnection, uid: number, input: AddressInput,
  type: "invoice" | "delivery", parentId: number): Promise<Record<string, unknown>> {
  // Resolve country from the input string (if any).
  let resolved = await resolveCountryId(conn, uid, input.country);

  // Sanity check: if ZIP/state confidently point to US/Canada and the resolved
  // country is different, the input string was wrong/ambiguous (AI extraction
  // picked up a stray "AU", "Australia", etc.). Trust the ZIP/state signal.
  const inferredName = inferCountry(input.state, input.zip);
  if (inferredName && (!resolved || resolved.name !== inferredName)) {
    if (resolved && resolved.name !== inferredName) {
      // PII-safe log: do not include raw zip/state (customer-identifying).
      // Country names are fine — they are not PII.
      console.log(
        `[country-override] resolved='${resolved.name}' overridden to '${inferredName}' from ZIP/state signal`,
      );
    }
    const overridden = await resolveCountryId(conn, uid, inferredName);
    if (overridden) resolved = overridden;
  }

  // Final fallback: every customer in this tenant is US or Canada, so if we
  // still don't have a country, default to United States rather than leaving empty.
  if (!resolved) {
    resolved = await resolveCountryId(conn, uid, "United States");
  }

  const countryId = resolved?.id ?? null;
  // If state is missing or empty, try to infer it from the ZIP (US/Canada lookup).
  // This catches the common DocFlow case where Claude extracts ZIP+city but skips the state.
  let stateToResolve = input.state;
  if (!stateToResolve || !stateToResolve.trim()) {
    const inferredState = inferStateFromZip(input.zip);
    if (inferredState) {
      // PII-safe: only log inferred state code (public info), not the customer ZIP.
      console.log(`[state-infer] inferred state='${inferredState}' from ZIP prefix`);
      stateToResolve = inferredState;
    }
  }
  const stateId = await resolveStateId(conn, uid, stateToResolve, countryId);

  const vals: Record<string, unknown> = {
    parent_id: parentId, type, is_company: false, company_type: "person",
    name: input.name ?? "Address",
    street:  input.street  ?? false,
    street2: input.street2 ?? false,
    city:    input.city    ?? false,
    zip:     input.zip     ?? false,
    phone:   input.phone   ?? false,
    email:   input.email   ?? false,
    country_id: countryId ?? false,
    state_id:   stateId   ?? false,
  };
  return vals;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { order_draft_id?: unknown; tenant_id?: unknown };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { order_draft_id: draftId, tenant_id: tenantId } = body;
  if (!validUuid(draftId) || !validUuid(tenantId))
    return json({ error: "Invalid order_draft_id or tenant_id" }, 400);

  const supabase = createServiceClient();

  // Select all draft fields so the DocFlow JSON attachment is a complete snapshot
  const { data: draft } = await supabase
    .from("order_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: lines } = await supabase
    .from("order_draft_lines")
    .select("*")
    .eq("order_draft_id", draftId)
    .eq("tenant_id", tenantId)
    .order("position", { ascending: true });

  if (!draft) return json({ error: "Order draft not found" }, 404);
  if (!draft.odoo_so_id) return json({ error: "Order draft has no Odoo SO linked" }, 422);

  const { data: connRow } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!connRow) return json({ error: "No Odoo connection configured" }, 422);

  try {
    const password = await decrypt(connRow.api_key_enc, secrets.intakeSecretsKey);
    const conn: OdooConnection = {
      baseUrl: connRow.base_url, database: connRow.database,
      username: connRow.username, password,
    };
    const uid = await odooAuthenticate(conn);

    // ── 1. Read the SO to get the customer partner ────────────────────────
    const soRows = (await odooExecute(conn, uid, "sale.order", "read", [
      [draft.odoo_so_id],
      ["partner_id"],
    ])) as Array<{ partner_id: unknown }>;
    if (!soRows.length) throw new Error(`Odoo SO id=${draft.odoo_so_id} not found`);

    const customerPartnerId = rawId(soRows[0].partner_id);
    if (!customerPartnerId) throw new Error("Could not read customer partner from SO");

    // ── 2. Normalize addresses from DocFlow ───────────────────────────────────
    const buyerName  = readJsonTextAny(draft.buyer, ["name", "full_name", "contact_name"]);
    const buyerEmail = readJsonTextAny(draft.buyer, ["email", "mail"]);
    const buyerPhone = readJsonTextAny(draft.buyer, ["phone", "mobile", "tel"]);

    // Read the customer's display name from Odoo as the ultimate name fallback
    const partnerRows = (await odooExecute(conn, uid, "res.partner", "read", [
      [customerPartnerId], ["name"],
    ])) as Array<{ name: string }>;
    const odooCustomerName = partnerRows[0]?.name ?? null;

    const shippingAddr = normalizeAddress(draft.shipping_address, {
      name: buyerName ?? odooCustomerName,
      email: buyerEmail,
      phone: buyerPhone,
    });
    // Mirror odoo-sync: if shipping has no name, use buyer/customer name
    if (!shippingAddr.name) shippingAddr.name = buyerName ?? odooCustomerName;

    const billingAddr = normalizeAddress(draft.billing_address, {
      name: shippingAddr.name ?? odooCustomerName,
      email: buyerEmail,
      phone: buyerPhone,
    });
    if (!billingAddr.name) billingAddr.name = shippingAddr.name ?? odooCustomerName;

    const shippingVals = await buildAddressVals(conn, uid, shippingAddr, "delivery", customerPartnerId);
    const billingVals  = await buildAddressVals(conn, uid, billingAddr,  "invoice",  customerPartnerId);

    // ── 3. Create fresh child partners for this SO ─────────────────────────
    //
    // Always create NEW partner records — never write to the existing ones.
    // The existing partners may be shared with other sales orders (a legacy
    // of the previous reuse-by-address behavior), and writing to them would
    // cascade the change to every linked order. Per-order isolation requires
    // each SO to own a dedicated address partner.

    const finalShippingId = (await odooExecute(conn, uid, "res.partner", "create", [shippingVals])) as number;
    const finalInvoiceId  = (await odooExecute(conn, uid, "res.partner", "create", [billingVals])) as number;

    // ── 4. Point the SO at the new partners ───────────────────────────────
    await odooExecute(conn, uid, "sale.order", "write", [
      [draft.odoo_so_id],
      { partner_shipping_id: finalShippingId, partner_invoice_id: finalInvoiceId },
    ]);

    // ── 5. Refresh DocFlow JSON attachment ────────────────────────────────────
    // Complete snapshot of the draft state (mirrors odoo-sync format) so the
    // attachment is always a full audit record, not a partial diff.
    try {
      const existing = (await odooExecute(conn, uid, "ir.attachment", "search_read", [[
        ["res_model", "=", "sale.order"], ["res_id", "=", draft.odoo_so_id],
        ["name", "like", "DocFlow-"], ["mimetype", "=", "application/json"],
      ], ["id"], 0, 10])) as Array<{ id: number }>;
      if (existing.length > 0)
        await odooExecute(conn, uid, "ir.attachment", "unlink", [existing.map((r) => r.id)]);

      const draftRecord = draft as Record<string, unknown>;

      let documentMeta: Record<string, unknown> | null = null;
      try {
        const docId = draftRecord.document_id;
        if (typeof docId === "string") {
          const { data: docRow } = await supabase
            .from("documents")
            .select("id, original_name, mime_type, storage_path, source_channel, created_at")
            .eq("id", docId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          if (docRow) documentMeta = docRow as Record<string, unknown>;
        }
      } catch { /* non-fatal */ }

      let providerMeta: Record<string, unknown> | null = null;
      try {
        const pId = draftRecord.provider_id;
        if (typeof pId === "string" && validUuid(pId)) {
          const { data: provRow } = await supabase
            .from("providers")
            .select("id, name, slug")
            .eq("id", pId)
            .maybeSingle();
          if (provRow) providerMeta = provRow as Record<string, unknown>;
        }
      } catch { /* non-fatal */ }

      const sdmRecord = {
        sdm_version: "1.1",
        fixed_at: new Date().toISOString(),
        action: "fix_addresses",
        odoo: {
          so_id: draft.odoo_so_id,
          customer_partner_id: customerPartnerId,
          partner_invoice_id: finalInvoiceId,
          partner_shipping_id: finalShippingId,
        },
        draft: draftRecord,
        lines: lines ?? [],
        document: documentMeta,
        provider: providerMeta,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(sdmRecord, null, 2));
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const poRef = draft.po_number
        ? String(draft.po_number).replace(/[^A-Za-z0-9_-]/g, "-")
        : draft.id;
      await odooExecute(conn, uid, "ir.attachment", "create", [{
        name: `DocFlow-${poRef}.json`, res_model: "sale.order", res_id: draft.odoo_so_id,
        type: "binary", datas: btoa(bin), mimetype: "application/json",
      }]);
    } catch { /* non-fatal */ }

    return json({ ok: true, partner_shipping_id: finalShippingId, partner_invoice_id: finalInvoiceId });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[odoo-fix-addresses]", draftId, msg);
    return json({ error: msg }, 500);
  }
});
