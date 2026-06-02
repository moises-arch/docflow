// Walmart Returns API.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-returns/

import { walmartRequest } from "@/lib/walmart/client";

export type WalmartReturn = {
  returnOrderId: string;
  customerOrderId?: string;
  customerOrderLineNumber?: string;
  purchaseOrderId?: string;
  status: string; // INITIATED | DELIVERED | COMPLETED
  reason?: string;
  refund?: {
    refundStatus?: string;
    refundedAmount?: { currency: string; amount: number };
  };
  returnLines?: Array<{
    lineNumber: string;
    item?: { sku: string; productName: string };
    returnReason?: string;
    returnQuantity?: { amount: string };
  }>;
};

export type ReturnsResponse = {
  returns?: WalmartReturn[];
  nextCursor?: string;
  totalCount?: number;
};

export async function getReturns(
  options: {
    limit?: number;
    nextCursor?: string;
    returnCreatedStartDate?: string; // ISO
    returnCreatedEndDate?: string;
    status?: "INITIATED" | "DELIVERED" | "COMPLETED";
    correlationId?: string;
  } = {},
): Promise<ReturnsResponse> {
  return walmartRequest<ReturnsResponse>({
    path: "/v3/returns",
    query: {
      limit: options.limit ?? 100,
      nextCursor: options.nextCursor,
      returnCreatedStartDate: options.returnCreatedStartDate,
      returnCreatedEndDate: options.returnCreatedEndDate,
      status: options.status,
    },
    correlationId: options.correlationId,
  });
}

/**
 * Approve a return and refund the customer.
 * NOT called automatically — requires manual user action from the dashboard.
 */
export async function refundReturn(
  returnOrderId: string,
  body: {
    returnLines: Array<{
      lineNumber: string;
      refundAmount: number;
    }>;
    reason?: string;
  },
  correlationId?: string,
): Promise<unknown> {
  return walmartRequest({
    method: "POST",
    path: `/v3/returns/${encodeURIComponent(returnOrderId)}/refund`,
    body,
    correlationId,
  });
}
