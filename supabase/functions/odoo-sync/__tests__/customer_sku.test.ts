import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSaleOrderLineVals } from "../line-vals.ts";

Deno.test("buildSaleOrderLineVals includes x_customer_sku when line.customer_sku is present", () => {
  const result = buildSaleOrderLineVals({
    soId: 42,
    productId: 100,
    line: {
      position: 1,
      sku: "GG622L", // OUR internal code (post-swap)
      customer_sku: "G010841324", // Zoro's Buyer's Part Number
      description: "Heavy Duty 8 Mil Nitrile Gloves",
      quantity: 2,
      unit_price: 8.45,
    },
  });
  assertEquals(result.x_customer_sku, "G010841324");
  assertEquals(result.product_id, 100);
  assertEquals(result.product_uom_qty, 2);
  assertEquals(result.price_unit, 8.45);
});

Deno.test("buildSaleOrderLineVals omits x_customer_sku when customer_sku is null (no swap)", () => {
  // When ai-process didn't swap, line.sku already matched our catalog.
  // line.customer_sku stays null and we DO NOT fall back to line.sku.
  const result = buildSaleOrderLineVals({
    soId: 42,
    productId: 100,
    line: {
      sku: "GG622L",
      customer_sku: null,
      description: "Item",
      quantity: 1,
      unit_price: 5,
    },
  });
  assertEquals(result.x_customer_sku, undefined);
});

Deno.test("buildSaleOrderLineVals does NOT fall back to line.sku when customer_sku is missing", () => {
  // Critical regression guard: previous version of this helper used line.sku
  // as fallback, which sent OUR internal code as x_customer_sku — exactly the
  // bug this whole feature exists to fix.
  const result = buildSaleOrderLineVals({
    soId: 42,
    productId: 100,
    line: {
      sku: "GG622L",
      // customer_sku omitted entirely
      description: "Item",
      quantity: 1,
      unit_price: 5,
    },
  });
  assertEquals(result.x_customer_sku, undefined);
});

Deno.test("buildSaleOrderLineVals omits x_customer_sku when customer_sku is empty string", () => {
  const result = buildSaleOrderLineVals({
    soId: 42,
    productId: 100,
    line: {
      sku: "GG622L",
      customer_sku: "",
      description: "Generic",
      quantity: 1,
      unit_price: 5,
    },
  });
  assertEquals(result.x_customer_sku, undefined);
});

Deno.test("buildSaleOrderLineVals trims whitespace around customer_sku", () => {
  const result = buildSaleOrderLineVals({
    soId: 1,
    productId: 1,
    line: {
      sku: "INTERNAL",
      customer_sku: "  ZOR-99999  ",
      description: "x",
      quantity: 1,
      unit_price: 1,
    },
  });
  assertEquals(result.x_customer_sku, "ZOR-99999");
});

Deno.test("buildSaleOrderLineVals omits x_customer_sku when customer_sku is whitespace only", () => {
  const result = buildSaleOrderLineVals({
    soId: 1,
    productId: 1,
    line: {
      sku: "INTERNAL",
      customer_sku: "   ",
      description: "x",
      quantity: 1,
      unit_price: 1,
    },
  });
  assertEquals(result.x_customer_sku, undefined);
});

Deno.test("buildSaleOrderLineVals defaults quantity to 1 when null", () => {
  const result = buildSaleOrderLineVals({
    soId: 1,
    productId: 1,
    line: { sku: "X", customer_sku: "Y", description: "x", quantity: null, unit_price: 1 },
  });
  assertEquals(result.product_uom_qty, 1);
});

Deno.test("buildSaleOrderLineVals defaults price_unit to 0 when null", () => {
  const result = buildSaleOrderLineVals({
    soId: 1,
    productId: 1,
    line: { sku: "X", customer_sku: "Y", description: "x", quantity: 1, unit_price: null },
  });
  assertEquals(result.price_unit, 0);
});

Deno.test("buildSaleOrderLineVals: realistic Zoro PO scenario", () => {
  // Zoro PO 59871090, line 1:
  //   Buyer's Part Number: G010841324  ← customer_sku
  //   Vendor's Item Number: GG622L      ← our internal sku (after ai-process swap)
  const result = buildSaleOrderLineVals({
    soId: 1000,
    productId: 925, // Heavy Duty 8 Mil Nitrile Gloves
    line: {
      position: 1,
      sku: "GG622L",
      customer_sku: "G010841324",
      description: "Heavy Duty 8 Mil Nitrile Gloves",
      quantity: 1,
      unit_price: 8.45,
    },
  });
  assertEquals(result.product_id, 925);
  assertEquals(result.x_customer_sku, "G010841324");
  // sku is NOT directly sent — it's only used to resolve product_id upstream.
  // x_customer_sku must hold what Zoro recognizes.
});
