// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { makeMockAuthClient, noMembership, okMembership } from "@/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const mockCreateClient = vi.mocked(createClient);
const ctx = { params: Promise.resolve({ id: "prov-1" }) };

function req() {
  return new Request("http://localhost/api/settings/providers/prov-1/kpis", {
    method: "GET",
  }) as never;
}

// A chainable builder that resolves with a custom value when awaited.
function resolveBuilder(result: unknown) {
  const settled = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: settled.then.bind(settled),
    catch: settled.catch.bind(settled),
  };
  return builder;
}

describe("GET /api/settings/providers/[id]/kpis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 without tenant", async () => {
    const auth = makeMockAuthClient();
    auth.from.mockReturnValueOnce(noMembership());
    mockCreateClient.mockResolvedValue(auth as never);
    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(403);
  });

  it("aggregates KPI shape with zero data", async () => {
    const auth = makeMockAuthClient();
    auth.from
      .mockReturnValueOnce(okMembership())
      // docs30d count
      .mockReturnValueOnce(resolveBuilder({ count: 0, data: null, error: null }))
      // needsReview count
      .mockReturnValueOnce(resolveBuilder({ count: 0, data: null, error: null }))
      // syncCounts data
      .mockReturnValueOnce(resolveBuilder({ data: [], error: null }))
      // extractions
      .mockReturnValueOnce(resolveBuilder({ data: [], error: null }))
      // activity docs
      .mockReturnValueOnce(resolveBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(auth as never);

    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      docs30d: 0,
      needsReview: 0,
      syncRate: null,
      avgConfidence: null,
    });
    expect(body.activity).toHaveLength(14);
    expect(body.activity[0].count).toBe(0);
  });

  it("computes syncRate and avgConfidence from data", async () => {
    const auth = makeMockAuthClient();
    auth.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(resolveBuilder({ count: 12, data: null, error: null }))
      .mockReturnValueOnce(resolveBuilder({ count: 3, data: null, error: null }))
      .mockReturnValueOnce(
        resolveBuilder({
          data: [
            { sync_state: "synced" },
            { sync_state: "synced" },
            { sync_state: "synced" },
            { sync_state: "sync_failed" },
            { sync_state: "pending" }, // ignored in denominator
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        resolveBuilder({
          data: [{ confidence: 0.8 }, { confidence: 0.6 }, { confidence: null }],
          error: null,
        }),
      )
      .mockReturnValueOnce(resolveBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(auth as never);

    const res = (await GET(req(), ctx))!;
    const body = await res.json();
    expect(body.docs30d).toBe(12);
    expect(body.needsReview).toBe(3);
    expect(body.syncRate).toBeCloseTo(3 / 4);
    expect(body.avgConfidence).toBeCloseTo(0.7);
  });
});
