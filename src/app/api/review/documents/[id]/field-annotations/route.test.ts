// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
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

const getReq = new Request(
  `http://localhost/api/review/documents/${DOC_ID}/field-annotations?provider_id=prov-1`,
  { method: "GET" },
);

const deleteBody = { provider_id: "prov-1", target_field_key: "partner_id" };
const deleteReq = new Request(`http://localhost/api/review/documents/${DOC_ID}/field-annotations`, {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(deleteBody),
});

const postBody = {
  provider_id: "prov-1",
  target_field_key: "partner_id",
  value: "Acme Corp",
  source_hint: "ACME",
};
function postReq(body: unknown) {
  return new Request(`http://localhost/api/review/documents/${DOC_ID}/field-annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DOC_EXISTS = makeQueryBuilder({ data: { id: DOC_ID }, error: null });
const ANNOTATIONS = [{ id: "ann-1", target_field_key: "partner_id", value: "Acme" }];

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/review/documents/[id]/field-annotations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(getReq as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);
    const res = (await GET(getReq as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when document does not belong to tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);
    const res = (await GET(getReq as never, ctx))!;
    expect(res.status).toBe(404);
  });

  it("returns 200 with annotations list", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(DOC_EXISTS);
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: ANNOTATIONS, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(getReq as never, ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/review/documents/[id]/field-annotations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await DELETE(deleteReq as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing required fields in body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(DOC_EXISTS);
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request(
      `http://localhost/api/review/documents/${DOC_ID}/field-annotations`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1" }), // missing target_field_key
      },
    );
    const res = (await DELETE(badReq as never, ctx))!;
    expect(res.status).toBe(422);
  });

  it("returns 200 on successful delete", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(DOC_EXISTS);
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(deleteReq as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});

// ─── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/review/documents/[id]/field-annotations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(postReq(postBody) as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 422 when provider_id is missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(DOC_EXISTS);
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: { id: DOC_ID }, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      postReq({ target_field_key: "partner_id", value: "Acme" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(422);
  });

  it("returns 200 on successful upsert", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // order_drafts
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "tf-1", review_profile_id: "rp-1" }, error: null }),
      ); // target_fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const noError = makeQueryBuilder({ data: null, error: null });
    serviceClient.from
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: DOC_ID }, error: null })) // documents
      .mockReturnValue(noError); // upserts
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(postReq(postBody) as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});
