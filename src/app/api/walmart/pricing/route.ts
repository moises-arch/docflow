// Pricing endpoint — promotional prices + incentive items.
// On-demand: hits Walmart API directly because pricing data isn't critical
// to cache (changes infrequently and small dataset).

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { getPromotionalPrices, getIncentiveItems } from "@/lib/walmart/api/pricing";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;

  const correlationId = randomUUID();

  const [promoResult, incentiveResult] = await Promise.allSettled([
    getPromotionalPrices({ limit: 100, correlationId }),
    getIncentiveItems({ limit: 100, correlationId }),
  ]);

  return NextResponse.json({
    promotional:
      promoResult.status === "fulfilled"
        ? promoResult.value.items ?? []
        : { error: promoResult.reason instanceof Error ? promoResult.reason.message : "fail" },
    incentives:
      incentiveResult.status === "fulfilled"
        ? incentiveResult.value.incentiveItems ?? []
        : { error: incentiveResult.reason instanceof Error ? incentiveResult.reason.message : "fail" },
    summary: {
      promo_count:
        promoResult.status === "fulfilled" ? (promoResult.value.items ?? []).length : 0,
      incentive_count:
        incentiveResult.status === "fulfilled"
          ? (incentiveResult.value.incentiveItems ?? []).length
          : 0,
    },
  });
}
