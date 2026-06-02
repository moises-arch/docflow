/**
 * Token-bucket rate limit per (tenant_id, key).
 *
 * Refill: lazy. Tokens replenish at `refillPerHour / 3600` tokens per second
 * since `refilled_at`, capped at `capacity`. Each call consumes 1 token.
 *
 * Returns `{ ok: true, remaining }` or `{ ok: false, retryAfterSec }`.
 */
import { createServiceClient } from "@/lib/supabase/service";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimitOptions {
  tenantId: string;
  key: string;
  capacity: number;
  refillPerHour: number;
}

export async function checkAndConsume(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { tenantId, key, capacity, refillPerHour } = opts;
  const refillRatePerSec = refillPerHour / 3600;
  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = service as any;

  const now = new Date();

  const { data: existing } = await db
    .from("rate_limit_buckets")
    .select("tokens, refilled_at")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle();

  let tokens: number;
  if (!existing) {
    // First hit — bucket starts full, consume 1.
    tokens = capacity - 1;
    await db.from("rate_limit_buckets").insert({
      tenant_id: tenantId,
      key,
      tokens,
      refilled_at: now.toISOString(),
    });
    return { ok: true, remaining: tokens, retryAfterSec: 0 };
  }

  // Lazy refill.
  const elapsedSec = (now.getTime() - new Date(existing.refilled_at).getTime()) / 1000;
  const refilled = Math.min(capacity, existing.tokens + Math.floor(elapsedSec * refillRatePerSec));

  if (refilled < 1) {
    // Empty bucket — compute time until 1 token refills.
    const secsForOneToken = Math.ceil(1 / refillRatePerSec - elapsedSec);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, secsForOneToken) };
  }

  tokens = refilled - 1;
  await db
    .from("rate_limit_buckets")
    .update({ tokens, refilled_at: now.toISOString() })
    .eq("tenant_id", tenantId)
    .eq("key", key);

  return { ok: true, remaining: tokens, retryAfterSec: 0 };
}

/** Apply rate-limit and return a 429 Response, or null if request passes. */
export function rateLimitResponse(result: RateLimitResult): Response | null {
  if (result.ok) return null;
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      retryAfterSec: result.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    },
  );
}
