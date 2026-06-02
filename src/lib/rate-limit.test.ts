import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Supabase service client BEFORE importing the module under test.
type Bucket = { tokens: number; refilled_at: string };
const buckets: Map<string, Bucket> = new Map();
const bucketKey = (tenant: string, key: string) => `${tenant}|${key}`;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: (_c1: string, v1: string) => ({
          eq: (_c2: string, v2: string) => ({
            maybeSingle: async () => ({
              data: buckets.get(bucketKey(v1, v2)) ?? null,
              error: null,
            }),
          }),
        }),
      }),
      insert: async (row: { tenant_id: string; key: string; tokens: number; refilled_at: string }) => {
        buckets.set(bucketKey(row.tenant_id, row.key), {
          tokens: row.tokens,
          refilled_at: row.refilled_at,
        });
        return { data: row, error: null };
      },
      update: (patch: { tokens: number; refilled_at: string }) => ({
        eq: (_c1: string, v1: string) => ({
          eq: (_c2: string, v2: string) => {
            const k = bucketKey(v1, v2);
            const existing = buckets.get(k);
            if (existing) buckets.set(k, { ...existing, ...patch });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
  }),
}));

import { checkAndConsume, rateLimitResponse } from "./rate-limit";

const NOW = new Date("2026-05-06T12:00:00Z");

beforeEach(() => {
  buckets.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkAndConsume", () => {
  it("first request: bucket initialized full minus one", async () => {
    const r = await checkAndConsume({
      tenantId: "t1",
      key: "upload",
      capacity: 10,
      refillPerHour: 10,
    });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it("consumes tokens until empty", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkAndConsume({ tenantId: "t1", key: "k", capacity: 5, refillPerHour: 5 });
      expect(r.ok).toBe(true);
    }
    const next = await checkAndConsume({
      tenantId: "t1",
      key: "k",
      capacity: 5,
      refillPerHour: 5,
    });
    expect(next.ok).toBe(false);
    expect(next.retryAfterSec).toBeGreaterThan(0);
  });

  it("refills tokens lazily over time", async () => {
    // Drain the bucket.
    for (let i = 0; i < 3; i++) {
      await checkAndConsume({ tenantId: "t1", key: "k", capacity: 3, refillPerHour: 3 });
    }
    const exhausted = await checkAndConsume({
      tenantId: "t1",
      key: "k",
      capacity: 3,
      refillPerHour: 3,
    });
    expect(exhausted.ok).toBe(false);

    // Advance 25 minutes — at 3/h that's >1 token refilled.
    vi.setSystemTime(new Date(NOW.getTime() + 25 * 60_000));

    const refilled = await checkAndConsume({
      tenantId: "t1",
      key: "k",
      capacity: 3,
      refillPerHour: 3,
    });
    expect(refilled.ok).toBe(true);
  });

  it("isolates buckets by tenant", async () => {
    for (let i = 0; i < 2; i++) {
      await checkAndConsume({ tenantId: "t1", key: "k", capacity: 2, refillPerHour: 2 });
    }
    const t1Empty = await checkAndConsume({
      tenantId: "t1",
      key: "k",
      capacity: 2,
      refillPerHour: 2,
    });
    expect(t1Empty.ok).toBe(false);

    const t2Fresh = await checkAndConsume({
      tenantId: "t2",
      key: "k",
      capacity: 2,
      refillPerHour: 2,
    });
    expect(t2Fresh.ok).toBe(true);
  });

  it("isolates buckets by key", async () => {
    for (let i = 0; i < 2; i++) {
      await checkAndConsume({ tenantId: "t1", key: "upload", capacity: 2, refillPerHour: 2 });
    }
    const uploadEmpty = await checkAndConsume({
      tenantId: "t1",
      key: "upload",
      capacity: 2,
      refillPerHour: 2,
    });
    expect(uploadEmpty.ok).toBe(false);

    const retryFresh = await checkAndConsume({
      tenantId: "t1",
      key: "retry-sync",
      capacity: 2,
      refillPerHour: 2,
    });
    expect(retryFresh.ok).toBe(true);
  });
});

describe("rateLimitResponse", () => {
  it("returns null when ok", () => {
    expect(rateLimitResponse({ ok: true, remaining: 5, retryAfterSec: 0 })).toBeNull();
  });

  it("returns 429 with Retry-After header on rate limit", async () => {
    const res = rateLimitResponse({ ok: false, remaining: 0, retryAfterSec: 42 });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBe("42");
    const body = (await res!.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSec).toBe(42);
  });
});
