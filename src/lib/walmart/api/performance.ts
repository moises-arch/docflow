// Walmart Seller Performance Scorecard.
// Docs: https://developer.walmart.com/us-marketplace/docs/seller-performance-apis

import { walmartRequest } from "@/lib/walmart/client";

export type SellerPerformance = {
  // All values typically come as percentages 0-100 or rates 0-1.
  // We normalize to 0-1 (e.g. 0.9876 = 98.76%) in the parser, not here.
  onTimeDeliveryRate?: number;
  validTrackingRate?: number;
  sellerResponseRate?: number;
  refundRate?: number;
  cancellationRate?: number;
  raw?: unknown;
};

/**
 * Fetches the most recent seller performance scorecard.
 * The API may return values as 0-100 percentages — we normalize.
 */
export async function getSellerPerformance(
  correlationId?: string,
): Promise<SellerPerformance> {
  const r = await walmartRequest<Record<string, unknown>>({
    path: "/v3/utilities/seller-performance",
    correlationId,
  });

  // The exact field names may vary by Walmart API version. We probe several
  // known candidates and normalize. If field is missing → undefined.
  function toRate(v: unknown): number | undefined {
    if (typeof v !== "number") return undefined;
    return v > 1 ? v / 100 : v;
  }

  const raw = r as Record<string, unknown>;
  return {
    onTimeDeliveryRate: toRate(raw.onTimeDeliveryRate ?? raw.onTimeShipmentRate),
    validTrackingRate: toRate(raw.validTrackingRate),
    sellerResponseRate: toRate(raw.sellerResponseRate ?? raw.sellerResponse),
    refundRate: toRate(raw.refundRate),
    cancellationRate: toRate(raw.cancellationRate ?? raw.cancellation),
    raw,
  };
}
