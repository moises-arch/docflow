// Walmart Pricing & Promotional Pricing APIs.
// Docs: https://developer.walmart.com/doc/us/mp/us-mp-pricing/

import { walmartRequest } from "@/lib/walmart/client";

export type PromotionalPriceItem = {
  sku: string;
  promoPrice: { currency: string; amount: number };
  comparisonPrice?: { currency: string; amount: number };
  promoEffectiveDate?: string;
  promoExpirationDate?: string;
};

export async function getPromotionalPrices(
  options: { limit?: number; nextCursor?: string; correlationId?: string } = {},
): Promise<{ items?: PromotionalPriceItem[]; nextCursor?: string }> {
  return walmartRequest({
    path: "/v3/items/promotional-price",
    query: {
      limit: options.limit ?? 100,
      nextCursor: options.nextCursor,
    },
    correlationId: options.correlationId,
  });
}

export type IncentiveItem = {
  itemId: string;
  productName: string;
  skuId: string;
  targetPrice: { currency: string; amount: number };
  incentiveType: string;
  baseReferralFee: number; // percent
  reducedReferralFee: number; // percent
};

/**
 * Items eligible for Walmart's Price Incentive program: lower the price below
 * the target → get a reduced referral fee. High-margin opportunity.
 */
export async function getIncentiveItems(
  options: { limit?: number; correlationId?: string } = {},
): Promise<{ incentiveItems?: IncentiveItem[]; nextCursor?: string }> {
  return walmartRequest({
    path: "/v3/items/price/incentive",
    query: { limit: options.limit ?? 100 },
    correlationId: options.correlationId,
  });
}
