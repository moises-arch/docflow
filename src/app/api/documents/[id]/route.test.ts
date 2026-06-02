// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
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

const DOC_ID = "doc-001";
const ctx = { params: Promise.resolve({ id: DOC_ID }) };
const req = new Request(`http://localhost/api/documents/${DOC_ID}`, { method: "DELETE" });

const DELETABLE_DOC = {
  id: DOC_ID,
  state: "needs_review",
  storage_path: "tenant-1/2024-01/doc-001.pdf",
};

describe("DELETE /api/documents/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when document is not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(404);
  });

  it("returns 409 when document is in a non-deletable state", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { ...DELETABLE_DOC, state: "reviewed" }, error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(409);
  });

  it("returns 500 when delete query fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DELETABLE_DOC, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: "DB error" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(500);
  });

  it("returns 200 on successful delete", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: DELETABLE_DOC, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(req as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});
