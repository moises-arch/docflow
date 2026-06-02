// Pure helper to construct the sale.order.line payload for Odoo create().
// Extracted from index.ts so it can be unit-tested without Odoo connectivity.

export type LineInput = {
  position?: number;
  sku?: string | null;
  /** Partner-recognized code (e.g. Zoro's Buyer's Part Number).
   *  Distinct from `sku` which now holds OUR internal default_code. */
  customer_sku?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  /** Tipo de línea — item por default, o discount/freight/surcharge/adjustment.
   *  Cuando es != "item" el caller pasa un product_id especial configurado
   *  en provider_settings.line_kind_products. */
  kind?: "item" | "discount" | "freight" | "surcharge" | "adjustment";
};

export type LineVals = {
  order_id: number;
  name: string | null | undefined;
  product_uom_qty: number;
  price_unit: number;
  product_id: number;
  x_customer_sku?: string;
};

export function buildSaleOrderLineVals(args: {
  soId: number;
  productId: number;
  line: LineInput;
}): LineVals {
  const { soId, productId, line } = args;
  // Para discount lines aseguramos que price_unit sea negativo (el modelo IA
  // ya tiende a devolverlo negativo, pero defensemos por si llega positivo).
  let priceUnit = line.unit_price ?? 0;
  if (line.kind === "discount" && priceUnit > 0) {
    priceUnit = -priceUnit;
  }
  const vals: LineVals = {
    order_id: soId,
    name: line.description,
    product_uom_qty: line.quantity ?? 1,
    price_unit: priceUnit,
    product_id: productId,
  };
  // x_customer_sku holds the partner-recognized code. Prefer the explicit
  // customer_sku field (populated by ai-process / apply-parsed when a swap
  // occurred). Skip when empty so Odoo's field defaults to false and the
  // packing-slip template falls back to default_code.
  //
  // We do NOT fall back to line.sku, because after ai-process, line.sku holds
  // OUR internal default_code — sending that as x_customer_sku would render
  // the internal code on the packing slip, defeating the purpose.
  const customerSku = (line.customer_sku ?? "").trim();
  if (customerSku) {
    vals.x_customer_sku = customerSku;
  }
  return vals;
}
