// Walmart order parser. Pure function — no side effects, no DB.
// Maps the Walmart Orders API response into a structure compatible with our
// order_drafts / order_draft_lines schema.
//
// Verified against real production data (PO 129112846190512 — Sandra A Long,
// price $45.06 USD). The Rithum integration was missing this exact price.

import type { WalmartOrder } from "@/lib/walmart/api/orders";

export type WalmartParsedLine = {
  line_number: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_of_measurement: string;
  unit_price: number;
  tax_amount: number;
  line_total: number;
  currency: string;
  status: string | null;
};

export type WalmartParsed = {
  po_number: string;
  customer_order_id: string;
  customer_email: string | null;
  order_date: string | null; // ISO
  ship_to: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
  };
  lines: WalmartParsedLine[];
  totals: {
    subtotal: number;
    tax_total: number;
    grand_total: number;
  };
  shipping_method: string | null;
  ship_node: { id: string; type: string } | null;
  estimated_ship_date: string | null;
  estimated_delivery_date: string | null;
};

function unixMsToIso(v: number | undefined | null): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v).toISOString();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseWalmartOrder(o: WalmartOrder): WalmartParsed {
  const lines: WalmartParsedLine[] = [];

  for (const ol of o.orderLines?.orderLine ?? []) {
    const productCharge = ol.charges?.charge?.find((c) => c.chargeType === "PRODUCT");
    const unitPrice = productCharge?.chargeAmount?.amount ?? 0;
    const taxAmount = productCharge?.tax?.taxAmount?.amount ?? 0;
    const currency = productCharge?.chargeAmount?.currency ?? "USD";
    const quantity = num(ol.orderLineQuantity?.amount);
    const status =
      ol.orderLineStatuses?.orderLineStatus?.[0]?.status ?? null;

    lines.push({
      line_number: ol.lineNumber,
      sku: ol.item?.sku ?? "",
      product_name: ol.item?.productName ?? "",
      quantity,
      unit_of_measurement: ol.orderLineQuantity?.unitOfMeasurement ?? "EACH",
      unit_price: unitPrice,
      tax_amount: taxAmount,
      line_total: +(unitPrice * quantity).toFixed(2),
      currency,
      status,
    });
  }

  const subtotal = +lines.reduce((s, l) => s + l.line_total, 0).toFixed(2);
  const taxTotal = +lines.reduce((s, l) => s + l.tax_amount * l.quantity, 0).toFixed(2);
  const grandTotal = +(subtotal + taxTotal).toFixed(2);

  const addr = o.shippingInfo?.postalAddress;

  return {
    po_number: o.purchaseOrderId,
    customer_order_id: o.customerOrderId ?? "",
    customer_email: o.customerEmailId ?? null,
    order_date: unixMsToIso(o.orderDate),
    ship_to: {
      name: addr?.name ?? null,
      line1: addr?.address1 ?? null,
      line2: addr?.address2 ?? null,
      city: addr?.city ?? null,
      state: addr?.state ?? null,
      zip: addr?.postalCode ?? null,
      country: addr?.country ?? null,
      phone: o.shippingInfo?.phone ?? null,
    },
    lines,
    totals: { subtotal, tax_total: taxTotal, grand_total: grandTotal },
    shipping_method: o.shippingInfo?.methodCode ?? null,
    ship_node: o.shipNode
      ? { id: o.shipNode.id, type: o.shipNode.type }
      : null,
    estimated_ship_date: unixMsToIso(o.shippingInfo?.estimatedShipDate),
    estimated_delivery_date: unixMsToIso(o.shippingInfo?.estimatedDeliveryDate),
  };
}
