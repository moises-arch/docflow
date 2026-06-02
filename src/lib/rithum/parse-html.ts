// Parse the Rithum order detail HTML into a structured payload that mirrors
// CleoParsed. Each section in the dashboard is wrapped in a stable widget:
//
//   <div class="fw_widget_windowtag">
//     <div class="fw_widget_windowtag_topbar">
//       <span class="fw_widget_windowtag_topbar_title">Order Summary</span>
//     </div>
//     <div class="fw_widget_windowtag_body"> ...table or text... </div>
//   </div>
//
// Sections we care about (in order):
//   - Order Summary  (Vendor, Merchant, PO Number, Order Date, ...)
//   - Ship To        (free-form text, name + multi-line address)
//   - Customer       (Home Depot — name only) OR Bill To (Walmart — full)
//   - Line Item Summary (table: LINE #, MERCHANT SKU, VENDOR SKU, UPC,
//                        DESCRIPTION, UNIT COST, QTY ORDERED, QTY, STATUS,
//                        EXPECTED SHIP DATE)
//   - Notes          (free-form text)

import { parseDocument, DomUtils } from "htmlparser2";
import type { AnyNode, Element } from "domhandler";

type AnyEl = Element;

export type RithumLine = {
  line_number: string;
  buyer_item_number: string; // MERCHANT SKU (their SKU)
  vendor_item_number: string | null; // VENDOR SKU (our SKU)
  upc: string | null;
  description: string;
  unit_price: number;
  quantity: number;
  uom: string; // "EA" by default
  total: number;
  status: string | null;
  expected_ship_date: string | null;
};

export type RithumParsed = {
  partner: string | null;
  partner_pid: "thehomedepot" | "walmartmp" | "thdso" | null;
  po_number: string | null;
  customer_order_number: string | null;
  order_date: string | null; // ISO YYYY-MM-DD
  delivery_date: string | null; // Do Not Deliver After / estimated delivery (ISO YYYY-MM-DD)
  status: string | null;
  substatus: string | null;
  shipping_method: string | null;
  expected_warehouse: string | null;
  sales_division: string | null;
  vendor_name: string | null;
  ship_to: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
  };
  bill_to: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  lines: RithumLine[];
  totals: {
    line_count: number | null;
    quantity_total: number | null;
    grand_total: number | null;
  };
  notes: string | null;
  raw_html_size: number;
};

function textOf(el: AnyNode | undefined | null): string {
  if (!el) return "";
  return DomUtils.textContent(el).trim().replace(/[ \t]+/g, " ");
}

function findAll(root: AnyNode | AnyNode[], predicate: (el: AnyEl) => boolean): AnyEl[] {
  return DomUtils.filter((n) => n.type === "tag" && predicate(n as AnyEl), root, true) as AnyEl[];
}

function parseNumber(s: string): number {
  const n = Number(String(s ?? "").replace(/[$,\s]/g, "").replace(/USD|EUR|MXN|CAD/gi, ""));
  return Number.isFinite(n) ? n : 0;
}

function partnerPidOf(name: string | null): RithumParsed["partner_pid"] {
  if (!name) return null;
  const m = name.toLowerCase();
  if (m.includes("home depot special")) return "thdso";
  if (m.includes("home depot")) return "thehomedepot";
  if (m.includes("walmart")) return "walmartmp";
  return null;
}

function dateToIso(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function findSectionByTitle(roots: AnyEl[], titleRe: RegExp): AnyEl | null {
  for (const widget of roots) {
    const titles = findAll(widget, (el) =>
      el.attribs?.class?.includes("fw_widget_windowtag_topbar_title"),
    );
    for (const t of titles) {
      if (titleRe.test(textOf(t))) return widget;
    }
  }
  return null;
}

function bodyOf(widget: AnyEl): AnyEl | null {
  const bodies = findAll(widget, (el) =>
    el.attribs?.class?.includes("fw_widget_windowtag_body"),
  );
  return bodies[0] ?? null;
}

// Walk a label/value table inside a widget body. Rithum's Order Summary
// renders pairs across columns: <td>Label</td><td>Value</td>...
function infoPairs(widget: AnyEl): Record<string, string> {
  const body = bodyOf(widget);
  if (!body) return {};
  const cells = findAll(body, (el) => el.name === "td" || el.name === "th").map((c) =>
    textOf(c),
  );
  const out: Record<string, string> = {};
  for (let i = 0; i < cells.length - 1; i += 2) {
    const k = cells[i].replace(/:$/, "").trim();
    const v = cells[i + 1].trim();
    if (k && v && !out[k]) out[k] = v;
  }
  return out;
}

// Parse the Ship To / Customer / Bill To free-form blocks. They look like:
//   CHRISTINA LOVETT
//   2577 BUYRN CIR
//   VIRGINIA BEACH, VA 23453
//   US
//   (blank)
//   Daytime Phone: 7572876806
//   Email: 4D8A...@relay.walmart.com
function parseAddressBlock(widget: AnyEl): {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
} {
  const body = bodyOf(widget);
  if (!body) {
    return {
      name: null,
      line1: null,
      line2: null,
      city: null,
      state: null,
      zip: null,
      country: null,
      phone: null,
      email: null,
    };
  }
  const text = textOf(body)
    .replace(/ /g, " ")
    .split(/[\r\n]+|<br\s*\/?\s*>/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let name: string | null = null;
  let line1: string | null = null;
  let line2: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  let country: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;

  for (const raw of text) {
    const phoneM = raw.match(/Daytime\s*Phone\s*:\s*([\d-+()\s]+)/i);
    if (phoneM) {
      phone = phoneM[1].trim();
      continue;
    }
    const emailM = raw.match(/Email\s*:\s*([^\s]+@[^\s]+)/i);
    if (emailM) {
      email = emailM[1].trim();
      continue;
    }
    // City, State Zip — e.g. "VIRGINIA BEACH, VA 23453"
    const cityM = raw.match(/^([A-Z .']+)\s*,\s*([A-Z]{2})\s+([\d-]+)$/i);
    if (cityM && !city) {
      city = cityM[1].trim();
      state = cityM[2].toUpperCase();
      zip = cityM[3];
      continue;
    }
    // 2-letter country at end
    if (/^(US|USA|MX|CA)$/i.test(raw) && !country) {
      country = raw.toUpperCase();
      continue;
    }
    if (!name) {
      name = raw;
      continue;
    }
    if (!line1) {
      line1 = raw;
      continue;
    }
    if (!line2) {
      line2 = raw;
      continue;
    }
  }

  return { name, line1, line2, city, state, zip, country, phone, email };
}

function parseLineItems(widget: AnyEl): RithumLine[] {
  const body = bodyOf(widget);
  if (!body) return [];
  const tables = findAll(body, (el) => el.name === "table");
  // The first table inside the body has the actual line item rows.
  const dataTable = tables[0];
  if (!dataTable) return [];

  const rows = findAll(dataTable, (el) => el.name === "tr");
  if (rows.length < 2) return [];

  // Header row tells us column order. Map column name → index.
  const headerCells = findAll(rows[0], (el) => el.name === "th" || el.name === "td").map((c) =>
    textOf(c).toUpperCase(),
  );

  const colIdx = (label: RegExp): number =>
    headerCells.findIndex((h) => label.test(h));
  const lineCol = colIdx(/LINE\s*#/);
  const merchantSkuCol = colIdx(/MERCHANT\s*SKU/);
  const vendorSkuCol = colIdx(/VENDOR\s*SKU/);
  const upcCol = colIdx(/^UPC$/);
  const descCol = colIdx(/^DESCRIPTION$/);
  const unitCostCol = colIdx(/UNIT\s*COST/);
  const qtyOrderedCol = colIdx(/QTY\s*ORDERED/);
  const qtyCol = colIdx(/^QTY$/);
  const statusCol = colIdx(/^STATUS$/);
  const shipDateCol = colIdx(/EXPECTED\s*SHIP\s*DATE/);

  const out: RithumLine[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = findAll(rows[i], (el) => el.name === "td").map((c) => textOf(c));
    if (cells.length === 0) continue;
    const get = (idx: number): string => (idx >= 0 && idx < cells.length ? cells[idx] : "");
    const lineNo = get(lineCol) || String(out.length + 1);
    const merchantSku = get(merchantSkuCol);
    if (!merchantSku) continue;
    const unitCost = parseNumber(get(unitCostCol));
    const quantity = parseNumber(get(qtyCol)) || parseNumber(get(qtyOrderedCol));
    out.push({
      line_number: lineNo,
      buyer_item_number: merchantSku,
      vendor_item_number: get(vendorSkuCol) || null,
      upc: get(upcCol) || null,
      description: get(descCol),
      unit_price: unitCost,
      quantity,
      uom: "EA",
      total: unitCost * quantity,
      status: get(statusCol) || null,
      expected_ship_date: dateToIso(get(shipDateCol)) ?? null,
    });
  }
  return out;
}

export function parseRithumHtml(html: string, partnerHint?: string): RithumParsed {
  const doc = parseDocument(html);
  const docChildren = doc.children as AnyNode[];
  const widgets = findAll(docChildren, (el) =>
    el.attribs?.class?.includes("fw_widget_windowtag"),
  ).filter((el) => el.attribs?.class?.split(/\s+/).includes("fw_widget_windowtag"));

  // ── Order Summary ─────────────────────────────────────────────────────────
  const orderSummary = findSectionByTitle(widgets, /^\s*Order Summary\s*$/i);
  const summary = orderSummary ? infoPairs(orderSummary) : {};

  // Field names map directly to what Rithum renders.
  const partnerName = summary["Merchant"] ?? partnerHint ?? null;
  const poNumber = summary["PO Number"] ?? null;
  const customerOrderNumber = summary["Customer Order Number"] ?? null;
  const orderDate = dateToIso(summary["Order Date"] ?? null);
  // "Do Not Deliver After" is the commitment/delivery deadline on THD orders.
  // Also check alternate field names used by different merchants.
  const deliveryDate = dateToIso(
    summary["Do Not Deliver After"] ??
    summary["Estimated Delivery Date"] ??
    summary["Expected Delivery Date"] ??
    summary["Requested Delivery Date"] ??
    summary["Must Arrive By"] ??
    null,
  );
  const status = summary["Status"] ?? null;
  const substatus = summary["Substatus"] ?? null;
  const shippingMethod =
    summary["Shipping Method"] ?? summary["Expected Shipping Method"] ?? null;
  const expectedWarehouse = summary["Expected Warehouse"] ?? null;
  const salesDivision = summary["Sales Division"] ?? null;
  const vendorName = summary["Vendor"] ?? null;

  // ── Ship To ───────────────────────────────────────────────────────────────
  const shipToWidget = findSectionByTitle(widgets, /^\s*Ship\s*To\s*$/i);
  const shipTo = shipToWidget
    ? parseAddressBlock(shipToWidget)
    : {
        name: null,
        line1: null,
        line2: null,
        city: null,
        state: null,
        zip: null,
        country: null,
        phone: null,
        email: null,
      };

  // ── Bill To / Customer ────────────────────────────────────────────────────
  const billToWidget =
    findSectionByTitle(widgets, /^\s*Bill\s*To\s*$/i) ??
    findSectionByTitle(widgets, /^\s*Customer\s*$/i);
  const billToParsed = billToWidget
    ? parseAddressBlock(billToWidget)
    : { name: null, phone: null, email: null };
  const billTo = {
    name: billToParsed.name,
    phone: "phone" in billToParsed ? (billToParsed.phone as string | null) : null,
    email: "email" in billToParsed ? (billToParsed.email as string | null) : null,
  };

  // ── Line items ────────────────────────────────────────────────────────────
  const linesWidget = findSectionByTitle(widgets, /Line\s*Item\s*Summary/i);
  const lines = linesWidget ? parseLineItems(linesWidget) : [];

  const lineCount = lines.length || null;
  const quantityTotal = lines.reduce((acc, ln) => acc + (ln.quantity || 0), 0) || null;
  const grandTotal = lines.reduce((acc, ln) => acc + (ln.total || 0), 0) || null;

  // ── Notes ────────────────────────────────────────────────────────────────
  const notesWidget = findSectionByTitle(widgets, /^\s*Notes\s*$/i);
  const notes = notesWidget ? textOf(bodyOf(notesWidget)) || null : null;

  return {
    partner: partnerName,
    partner_pid: partnerPidOf(partnerName),
    po_number: poNumber,
    customer_order_number: customerOrderNumber,
    order_date: orderDate,
    delivery_date: deliveryDate,
    status,
    substatus,
    shipping_method: shippingMethod,
    expected_warehouse: expectedWarehouse,
    sales_division: salesDivision,
    vendor_name: vendorName,
    ship_to: shipTo,
    bill_to: billTo,
    lines,
    totals: {
      line_count: lineCount,
      quantity_total: quantityTotal,
      grand_total: grandTotal,
    },
    notes,
    raw_html_size: html.length,
  };
}
