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
const req = new Request(`http://localhost/api/order-drafts/${DRAFT_ID}/reject`, { method: "POST" });

const REJECTABLE_DRAFT = {
  id: DRAFT_ID,
  document_id: "doc-001",
  documents: { state: "needs_review" },
};

describe("POST /api/order-drafts/[id]/reject", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("returns 409 when document is not in needs_review state", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: { ...REJECTABLE_DRAFT, documents: { state: "reviewed" } },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(409);
  });

  it("returns 500 when document update fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: REJECTABLE_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: "DB error" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(500);
  });

  it("returns 200 on successful rejection", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: REJECTABLE_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("populates rejected_by + rejected_at on the draft row", async () => {
    const authClient = makeMockAuthClient({ id: "user-xyz" });
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: REJECTABLE_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const docBuilder = makeQueryBuilder({ data: null, error: null });
    const draftBuilder = makeQueryBuilder({ data: null, error: null });
    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockImplementation((table: string) =>
      table === "documents" ? docBuilder : draftBuilder,
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);

    expect(docBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: "rejected" }),
    );
    expect(draftBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        rejected_by: "user-xyz",
        rejected_at: expect.any(String),
      }),
    );
    const payload = draftBuilder.update.mock.calls[0][0] as { rejected_at: string };
    expect(() => new Date(payload.rejected_at).toISOString()).not.toThrow();
  });
});
