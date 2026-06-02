// Walmart Inventory API.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-inventory/

import { walmartRequest } from "@/lib/walmart/client";

export type InventoryItem = {
  sku: string;
  quantity: { unit: string; amount: number };
  lagTime?: number; // days
};

export type InventoryResponse = {
  inventoryItems?: InventoryItem[];
  // Singular response shape (for getInventoryBySku)
  sku?: string;
  quantity?: { unit: string; amount: number };
  lagTime?: number;
};

export async function getInventoryBySku(
  sku: string,
  correlationId?: string,
): Promise<InventoryResponse | null> {
  try {
    return await walmartRequest<InventoryResponse>({
      path: "/v3/inventory",
      query: { sku },
      correlationId,
    });
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/**
 * WFS (Walmart Fulfillment Services) inventory — only relevant if any items
 * are fulfilled by Walmart. DocFlow is currently SellerFulfilled but this is
 * here for future-proofing and visibility.
 */
export async function getWfsInventory(
  options: {
    sku?: string;
    limit?: number;
    correlationId?: string;
  } = {},
): Promise<{ payload?: Array<{ sku: string; onHandQty: number; availableQty: number }> }> {
  return walmartRequest({
    path: "/v3/fulfillment/inventory",
    query: {
      sku: options.sku,
      limit: options.limit ?? 100,
    },
    correlationId: options.correlationId,
  });
}

/**
 * Inventory for a list of SKUs in batches. Walmart's per-SKU endpoint is
 * one-at-a-time, so we make N parallel calls (gated to 5 concurrent to
 * respect rate limits).
 */
export async function getInventoryForSkus(
  skus: string[],
  correlationId?: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const concurrency = 5;
  for (let i = 0; i < skus.length; i += concurrency) {
    const batch = skus.slice(i, i + concurrency);
    const responses = await Promise.allSettled(
      batch.map((sku) => getInventoryBySku(sku, correlationId)),
    );
    for (let j = 0; j < batch.length; j++) {
      const sku = batch[j];
      const r = responses[j];
      if (r.status === "fulfilled" && r.value?.quantity) {
        result.set(sku, r.value.quantity.amount);
      } else {
        result.set(sku, 0);
      }
    }
  }
  return result;
}
