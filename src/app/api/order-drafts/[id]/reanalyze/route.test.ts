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
const req = new Request(`http://localhost/api/order-drafts/${DRAFT_ID}/reanalyze`, {
  method: "POST",
});

const DRAFT = { id: DRAFT_ID, document_id: "doc-001" };
const DOC_READY = { id: "doc-001", state: "needs_review" };

describe("POST /api/order-drafts/[id]/reanalyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
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

  it("returns 404 when document is not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DRAFT, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(404);
  });

  it("returns 409 when document is already processing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { ...DOC_READY, state: "processing" }, error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(409);
  });

  it("returns 500 when document update fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DRAFT, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: DOC_READY, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: "DB error" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(500);
  });

  it("returns 200 with run_id on success", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DRAFT, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: DOC_READY, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.run_id).toBe("string");
  });
});
