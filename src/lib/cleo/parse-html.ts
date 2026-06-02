// Parse Cleo's printDocument HTML output into structured data. The Cleo
// template wraps the EDI 850 in nested tables that the AI struggles with.
// We extract authoritatively from the HTML using stable id/class anchors.
//
// Anchors used (verified against live Cleo output):
//   <table id="LIN:NNNN">        — one per line item; first row is headers,
//                                    second row is data values
//   <table id="information">     — name/value pairs (PO header, addresses)
//   table with "Quantity Total"  — totals row
//
// Returns structured JSON suitable for pre-populating order_draft + lines.

import { parseDocument, DomUtils } from "htmlparser2";
import type { AnyNode, Element } from "domhandler";

type AnyEl = Element;

export type CleoLine = {
  line_number: string;
  buyer_item_number: string; // their SKU (e.g. Zoro's G306171142)
  vendor_item_number: string | null; // our SKU (e.g. GW904XL) — Cleo includes
                                     // it as "Vendor's (Seller's) Item Number".
                                     // When present we can resolve directly
                                     // against odoo_products.default_code
                                     // without needing a per-provider mapping.
  quantity: number;
  uom: string;
  unit_price: number;
  total: number;
  upc: string | null;
  pack: number | null;
};

export type CleoParsed = {
  po_number: string | null;
  message_id: string | null;
  reference: string | null;
  date: string | null; // ISO YYYY-MM-DD if parseable
  currency: string | null;
  buying_party: {
    company_name: string | null;
    gln: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
  };
  supplier: {
    company_name: string | null;
  };
  ship_to: {
    name: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
  };
  lines: CleoLine[];
  totals: {
    line_count: number | null;
    quantity_total: number | null;
    grand_total: number | null;
  };
  raw_html_size: number;
};

function textOf(el: AnyNode | undefined | null): string {
  if (!el) return "";
  return DomUtils.textContent(el).trim().replace(/\s+/g, " ");
}

function parseNumber(s: string): number {
  const n = Number(String(s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function findAll(root: AnyNode | AnyNode[], predicate: (el: AnyEl) => boolean): AnyEl[] {
  return DomUtils.filter((n) => n.type === "tag" && predicate(n as AnyEl), root, true) as AnyEl[];
}

function tableRowsText(table: AnyEl): string[][] {
  const rows = findAll(table, (el) => el.name === "tr");
  return rows.map((tr) =>
    findAll(tr, (el) => el.name === "td" || el.name === "th").map((cell) => textOf(cell)),
  );
}

// Walk an "information" table that uses label/value rows. Cleo lays them out
// as nested cells, sometimes with `<th>Label</th><td>Value</td>` and sometimes
// `<td>Label</td><td>Value</td>`. We collect all text and pair them up.
function infoPairs(table: AnyEl): Record<string, string> {
  const cells = findAll(table, (el) => el.name === "td" || el.name === "th").map((c) => textOf(c));
  const out: Record<string, string> = {};
  for (let i = 0; i < cells.length - 1; i += 2) {
    const k = cells[i].replace(/:$/, "").trim();
    const v = cells[i + 1].trim();
    if (k && v) out[k] = v;
  }
  return out;
}

// Like infoPairs but excludes cells with colspan > 1 (section headers like
// "Bill-to-Party", "Address:"). Those headers misalign the label/value pairing
// when included — e.g. "Bill-to-Party" ends up paired with "Company Name:"
// instead of "Company Name:" being paired with its actual value.
function infoPairsFiltered(table: AnyEl): Record<string, string> {
  const cells = findAll(table, (el) => el.name === "td" || el.name === "th")
    .filter((c) => {
      const cs = c.attribs?.colspan;
      return !cs || parseInt(String(cs), 10) <= 1;
    })
    .map((c) => textOf(c));
  const out: Record<string, string> = {};
  for (let i = 0; i < cells.length - 1; i += 2) {
    const k = cells[i].replace(/:$/, "").trim();
    const v = cells[i + 1].trim();
    if (k && v) out[k] = v;
  }
  return out;
}

// Find the first table whose full text matches the given section header regex.
function findSectionTable(tables: AnyEl[], headerRe: RegExp): AnyEl | null {
  return tables.find((t) => headerRe.test(textOf(t))) ?? null;
}

function findValueByLabel(html: AnyEl[], label: RegExp): string | null {
  // Scan all info tables collecting label→value, return first match.
  for (const table of html) {
    const pairs = infoPairs(table);
    for (const [k, v] of Object.entries(pairs)) {
      if (label.test(k)) return v;
    }
  }
  return null;
}

export function parseCleoHtml(html: string): CleoParsed {
  const doc = parseDocument(html);
  const docChildren = doc.children as AnyNode[];
  // Cleo's HTML uses class="information" (NOT id="information").
  // Keep id check for backwards compat with any older snapshot.
  const informationTables = findAll(
    docChildren,
    (el) =>
      el.name === "table" &&
      (el.attribs?.id === "information" ||
        (el.attribs?.class ?? "").split(/\s+/).includes("information")),
  );
  const allTables = findAll(docChildren, (el) => el.name === "table");
  const linTables = allTables.filter((t) => (t.attribs?.id ?? "").startsWith("LIN:"));

  // ── Line items ─────────────────────────────────────────────────────────────
  const lines: CleoLine[] = [];
  for (const linTable of linTables) {
    const rows = tableRowsText(linTable);
    if (rows.length < 2) continue;
    const dataRow = rows[1]; // [Line#, Buyer Item, Qty, UoM, Unit Price, Total]
    if (dataRow.length < 6) continue;

    // UPC sits in the metadata rows below as "U.P.C. ... (1-5-5-1):" → "8100849..."
    const tableText = textOf(linTable);
    const upcMatch = tableText.match(/U\.P\.C\.[^:]*:\s*(\d{8,14})/i);
    const packMatch = tableText.match(/Pack:\s*(\d+)/i);
    // "Vendor's (Seller's) Item Number: GW904XL" — our internal SKU. Some
    // Cleo templates use straight quotes, others curly. Match both.
    const vendorMatch = tableText.match(
      /Vendor['’]?s?\s*\(?\s*Seller['’]?s?\s*\)?\s*Item\s*Number:\s*([A-Z0-9._\-/]+)/i,
    );

    lines.push({
      line_number: dataRow[0],
      buyer_item_number: dataRow[1],
      vendor_item_number: vendorMatch?.[1]?.trim() || null,
      quantity: parseNumber(dataRow[2]),
      uom: dataRow[3],
      unit_price: parseNumber(dataRow[4]),
      total: parseNumber(dataRow[5]),
      upc: upcMatch?.[1] ?? null,
      pack: packMatch ? parseNumber(packMatch[1]) : null,
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  let totals: CleoParsed["totals"] = { line_count: null, quantity_total: null, grand_total: null };
  for (const t of allTables) {
    const text = textOf(t);
    if (/Quantity\s+Total/i.test(text) && /Lines/i.test(text)) {
      const rows = tableRowsText(t);
      const dataRow = rows.find((r) => r.length >= 3 && /^\d/.test(r[0]));
      if (dataRow) {
        totals = {
          line_count: parseNumber(dataRow[0]) || null,
          quantity_total: parseNumber(dataRow[1]) || null,
          grand_total: parseNumber(dataRow[2]) || null,
        };
      }
      break;
    }
  }

  // ── Header info ────────────────────────────────────────────────────────────
  const poNumber = findValueByLabel(informationTables, /Purchase Order Number/i);
  const messageIdMatch = html.match(/Message\s*ID\s*[:#]?\s*(\d+)/i);
  const referenceMatch = html.match(/Reference\s*#?\s*[:]?\s*(\d{6,})/i);
  const dateRaw = findValueByLabel(informationTables, /^Date$/i);
  const currency = findValueByLabel(informationTables, /Currency|Buying Party/i);

  // ── Addresses — sección específica ────────────────────────────────────────
  // Cada sección (Bill-to-Party, Ship To) está en su propia tabla class="information".
  // Usamos infoPairsFiltered para excluir los encabezados colspan=2 que desalinean
  // el pairing label→value (e.g. "Bill-to-Party" no debe ser tratado como label).
  const billToTable = findSectionTable(informationTables, /bill.?to.?party|buying.?party|\bpurchaser\b/i);
  const shipToTable = findSectionTable(informationTables, /\bship\s+to\b/i);

  const billToPairs = billToTable ? infoPairsFiltered(billToTable) : {};
  const shipToPairs = shipToTable ? infoPairsFiltered(shipToTable) : {};

  // Bill-to / Buying Party — extraer desde la tabla de sección
  const buyingCompany =
    billToPairs["Company Name"] ??
    // fallback: búsqueda global para formatos alternativos de Cleo
    findValueByLabel(informationTables, /^Company\s*Name$/i);
  const gln =
    billToPairs["Global Location Number"] ??
    billToPairs["GLN"] ??
    findValueByLabel(informationTables, /Global\s*Location\s*Number/i);
  // NO fallback para addr1/addr2/cityState: si bill-to no tiene estos campos, es null.
  // Fallback a findValueByLabel causaría Bug 2 (retorna el valor del Ship-to).
  const addr1 = billToPairs["Address 1"] ?? null;
  const addr2 = billToPairs["Address 2"] ?? null;
  const cityState =
    billToPairs["City/State/Zip"] ?? billToPairs["City/State/ZIP"] ?? null;
  const country =
    billToPairs["Country"] ??
    findValueByLabel(informationTables, /^Country$/i);

  // City/State/Zip is "BENTONVILLE,AR 727124304" — split heuristically.
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  if (cityState) {
    const m = cityState.match(/^(.+?)[,\s]+([A-Z]{2})\s+([\d-]+)/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      zip = m[3];
    }
  }

  // Ship-to: fuente primaria → tabla class="information" con header "Ship To".
  // Fallback → flatText regex (formato Walmart/Sam's Club con "XSHIP TO" labels).
  const flatText = textOf(doc)
    .replace(/Textual\s+Data\s*:?/gi, " ")
    .replace(/\s+/g, " ");
  const NEXT_LABEL = "(?=XSHIP\\s+TO|XSHIP\\s+PT|XMEMBER|XCLUB|$)";
  function shipMatch(re: RegExp): string | null {
    const m = flatText.match(re);
    return m?.[1]?.trim() || null;
  }

  // Extraer campos del ship-to desde la tabla de sección
  const shipToNameTable =
    shipToPairs["Company Name"] ?? shipToPairs["Additional Name"] ?? null;
  const shipToAddr1Table = shipToPairs["Address 1"] ?? null;
  const shipToCityStateTable =
    shipToPairs["City/State/Zip"] ?? shipToPairs["City/State/ZIP"] ?? null;
  const shipToCountryTable = shipToPairs["Country"] ?? null;
  const shipToPhoneTable =
    shipToPairs["Telephone"] ?? shipToPairs["Phone"] ?? null;

  // Parsear City/State/Zip de la tabla si está disponible
  let shipToCityTable: string | null = null;
  let shipToStateTable: string | null = null;
  let shipToZipTable: string | null = null;
  if (shipToCityStateTable) {
    const m = shipToCityStateTable.match(/^(.+?)[,\s]+([A-Z]{2})\s+([\d-]+)/);
    if (m) {
      shipToCityTable = m[1].trim();
      shipToStateTable = m[2];
      shipToZipTable = m[3];
    }
  }

  // Combinar: tabla como fuente primaria, regex flatText como fallback
  const shipToName =
    shipToNameTable ??
    shipMatch(new RegExp(`XSHIP\\s+TO\\s+NAME\\s+(.+?)\\s+${NEXT_LABEL}`, "i"));
  const shipToAddr1 =
    shipToAddr1Table ??
    shipMatch(new RegExp(`XSHIP\\s+TO\\s+ADDR1\\s+(.+?)\\s+${NEXT_LABEL}`, "i"));
  const shipToCity =
    shipToCityTable ??
    shipMatch(new RegExp(`XSHIP\\s+TO\\s+CITY\\s+(.+?)\\s+${NEXT_LABEL}`, "i"));
  const shipToState =
    shipToStateTable ?? shipMatch(/XSHIP\s+TO\s+STATE\s+([A-Z]{2})\b/i);
  const shipToZip =
    shipToZipTable ?? shipMatch(/XSHIP\s+TO\s+ZIP[\s-]*CODE\s+([\d-]+)/i);
  const shipToCountry =
    shipToCountryTable ?? shipMatch(/XSHIP\s+TO\s+COUNTRY\s+([A-Z]{2,})\b/i);
  const shipToPhone =
    shipToPhoneTable ?? shipMatch(/XSHIP\s+TO\s+PHONE\s+([\d-]+)/i);

  // Supplier (us) — usually "DocFlow"
  const supplierMatch = html.match(/Supplier\/Manufacturer[\s\S]{0,500}?Company[\s\S]{0,40}?Name[\s\S]{0,40}?>([^<]+?)</i);
  const supplierName = supplierMatch?.[1]?.trim() ?? null;

  // Date normalize MM/DD/YYYY → ISO
  let dateIso: string | null = null;
  if (dateRaw) {
    const dm = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) {
      const [, mo, d, y] = dm;
      dateIso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  return {
    po_number: poNumber,
    message_id: messageIdMatch?.[1] ?? null,
    reference: referenceMatch?.[1] ?? null,
    date: dateIso,
    currency: currency && /USD|EUR|MXN|CAD/i.test(currency) ? currency.match(/USD|EUR|MXN|CAD/i)![0] : null,
    buying_party: {
      company_name: buyingCompany,
      gln,
      address1: addr1,
      address2: addr2,
      city,
      state,
      zip,
      country,
    },
    supplier: {
      company_name: supplierName,
    },
    ship_to: {
      name: shipToName,
      address1: shipToAddr1,
      city: shipToCity,
      state: shipToState,
      zip: shipToZip,
      country: shipToCountry,
      phone: shipToPhone,
    },
    lines,
    totals,
    raw_html_size: html.length,
  };
}
