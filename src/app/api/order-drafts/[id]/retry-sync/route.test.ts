// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  makeQueryBuilder,
  makeMockAuthClient,
  makeMockServiceClient,
  noMembership,
  okMembership,
} from "@/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceClient = vi.mocked(createServiceClient);

const DRAFT_ID = "draft-001";
const ctx = { params: Promise.resolve({ id: DRAFT_ID }) };
const req = new Request(`http://localhost/api/order-drafts/${DRAFT_ID}/retry-sync`, {
  method: "POST",
});

// sync_failed draft is always retryable
const SYNC_FAILED_DRAFT = {
  id: DRAFT_ID,
  sync_state: "sync_failed",
  updated_at: new Date().toISOString(),
};
// stuck in_progress: updated >3 min ago
const STUCK_DRAFT = {
  id: DRAFT_ID,
  sync_state: "in_progress",
  updated_at: new Date(Date.now() - 4 * 60_000).toISOString(),
};

describe("POST /api/order-drafts/[id]/retry-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    // Default service-client mock — rate-limit calls it before any draft work.
    const defaultService = makeMockServiceClient();
    defaultService.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(defaultService as never);
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when draft is not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(404);
  });

  it("returns 409 when draft sync_state is not retryable (e.g. synced)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: { id: DRAFT_ID, sync_state: "synced", updated_at: new Date().toISOString() },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(409);
  });

  it("allows retry when draft is stuck in_progress for >3 minutes", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: STUCK_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);
  });

  it("returns 502 when odoo-sync edge function responds with error", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: SYNC_FAILED_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal Error", { status: 500 })),
    );

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(502);
  });

  it("returns 200 with sync_state pending on success", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: SYNC_FAILED_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, sync_state: "pending" });
  });
});
