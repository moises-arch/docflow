// Walmart Orders API — wrappers around the orders endpoints.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-orders/

import { walmartRequest } from "@/lib/walmart/client";

// Verified shape (with real production data, see plan).
export type WalmartOrder = {
  purchaseOrderId: string;
  customerOrderId: string;
  customerEmailId?: string;
  orderDate: number; // Unix MS
  shippingInfo: {
    phone?: string;
    estimatedDeliveryDate?: number;
    estimatedShipDate?: number;
    methodCode?: string;
    postalAddress: {
      name: string;
      address1: string;
      address2: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      addressType?: string;
    };
  };
  orderLines: {
    orderLine: Array<{
      lineNumber: string;
      item: {
        productName: string;
        sku: string;
        condition?: string;
        imageUrl?: string;
      };
      orderLineQuantity: { unitOfMeasurement: string; amount: string };
      charges: {
        charge: Array<{
          chargeType: "PRODUCT" | "SHIPPING" | string;
          chargeName: string;
          chargeAmount: { currency: string; amount: number };
          tax?: { taxName: string; taxAmount: { currency: string; amount: number } };
        }>;
      };
      orderLineStatuses?: {
        orderLineStatus: Array<{ status: string }>;
      };
    }>;
  };
  shipNode?: { type: string; name?: string; id: string };
};

export type ReleasedOrdersResponse = {
  list: {
    meta: {
      totalCount: number;
      limit: number;
      nextCursor?: string;
    };
    elements: { order: WalmartOrder[] };
  };
};

export async function getOrder(
  purchaseOrderId: string,
  correlationId?: string,
): Promise<WalmartOrder> {
  const r = (await walmartRequest({
    path: `/v3/orders/${encodeURIComponent(purchaseOrderId)}`,
    query: { productInfo: "true" },
    correlationId,
  })) as { order: WalmartOrder };
  // Walmart wraps singular order responses inside { order: { ... } }
  return r.order ?? (r as unknown as WalmartOrder);
}

/**
 * Released orders are NEW unacknowledged orders that need processing.
 * After we acknowledge them, they leave this list.
 */
export async function getReleasedOrders(
  options: {
    limit?: number;
    cursor?: string;
    shipNodeType?: "SellerFulfilled" | "WFSFulfilled";
    correlationId?: string;
  } = {},
): Promise<ReleasedOrdersResponse> {
  return walmartRequest<ReleasedOrdersResponse>({
    path: "/v3/orders/released",
    query: {
      limit: options.limit ?? 100,
      productInfo: "true",
      shipNodeType: options.shipNodeType,
      // cursor — Walmart formats this as a query string token; we pass through
      ...(options.cursor ? { nextCursor: options.cursor } : {}),
    },
    correlationId: options.correlationId,
  });
}

/**
 * Acknowledge an order — removes it from the released bucket so it doesn't
 * get reprocessed. Idempotent: ack-ing an already-acked order returns 200.
 */
export async function acknowledgeOrder(
  purchaseOrderId: string,
  correlationId?: string,
): Promise<void> {
  await walmartRequest({
    method: "POST",
    path: `/v3/orders/${encodeURIComponent(purchaseOrderId)}/acknowledge`,
    correlationId,
  });
}

/**
 * Get all orders (acknowledged + released) within a date range. Used by the
 * scan-pending fallback to catch anything missed.
 */
export async function getAllOrders(
  options: {
    limit?: number;
    cursor?: string;
    createdStartDate?: string; // ISO
    correlationId?: string;
  } = {},
): Promise<ReleasedOrdersResponse> {
  return walmartRequest<ReleasedOrdersResponse>({
    path: "/v3/orders",
    query: {
      limit: options.limit ?? 100,
      productInfo: "true",
      createdStartDate: options.createdStartDate,
      ...(options.cursor ? { nextCursor: options.cursor } : {}),
    },
    correlationId: options.correlationId,
  });
}
