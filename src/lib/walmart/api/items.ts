// Walmart Items (catalog) API.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-items/

import { walmartRequest } from "@/lib/walmart/client";

export type WalmartItem = {
  mart: string;
  sku: string;
  wpid: string;
  upc?: string;
  gtin?: string;
  productName: string;
  shelf?: string;
  productType?: string;
  price?: { currency: string; amount: number };
  publishedStatus?: string; // PUBLISHED | UNPUBLISHED | etc.
  lifecycleStatus?: string; // ACTIVE | RETIRED | ARCHIVED | STAGE
  unpublishedReasons?: { reasons?: string[] };
  shipNodeType?: string; // SellerFulfilled | WFS
};

export type ItemsResponse = {
  ItemResponse: WalmartItem[];
  totalItems?: number;
  nextCursor?: string;
};

export async function getItems(
  options: {
    limit?: number;
    nextCursor?: string;
    sku?: string;
    lifecycleStatus?: "ACTIVE" | "STAGE" | "RETIRED" | "ARCHIVED";
    publishedStatus?: "PUBLISHED" | "UNPUBLISHED" | "STAGE" | "READY_TO_PUBLISH";
    correlationId?: string;
  } = {},
): Promise<ItemsResponse> {
  return walmartRequest<ItemsResponse>({
    path: "/v3/items",
    query: {
      limit: options.limit ?? 200, // Walmart max is 200
      nextCursor: options.nextCursor,
      sku: options.sku,
      lifecycleStatus: options.lifecycleStatus,
      publishedStatus: options.publishedStatus,
    },
    correlationId: options.correlationId,
  });
}

/**
 * Iterate through ALL items with automatic pagination.
 * Yields chunks of up to `limit` items at a time.
 */
export async function* iterateAllItems(
  options: { limit?: number; correlationId?: string } = {},
): AsyncGenerator<WalmartItem[]> {
  let cursor: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100; // safety: max 20K items per sync (200 × 100)

  do {
    const r = await getItems({
      limit: options.limit ?? 200,
      nextCursor: cursor,
      correlationId: options.correlationId,
    });
    if (r.ItemResponse?.length) {
      yield r.ItemResponse;
    }
    cursor = r.nextCursor;
    pageCount += 1;
  } while (cursor && pageCount < maxPages);
}

export async function getItemBySku(
  sku: string,
  correlationId?: string,
): Promise<WalmartItem | null> {
  const r = await getItems({ sku, limit: 1, correlationId });
  return r.ItemResponse?.[0] ?? null;
}
