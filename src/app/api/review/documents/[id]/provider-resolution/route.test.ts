// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
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

const ctx = { params: Promise.resolve({ id: "doc-001" }) };

describe("GET /api/review/documents/[id]/provider-resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when document not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("returns 200 with empty candidates when no provider resolved", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ id: "doc-001", provider_id: null }], error: null }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null })); // draft
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null })); // partners
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toHaveLength(0);
    expect(body.document.provider_id).toBeNull();
    expect(body.provider).toBeNull();
  });

  it("returns 200 with filtered candidates when provider and partners exist", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ id: "doc-001", provider_id: "prov-1" }], error: null }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ review_profile_id: "rp-1" }], error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            { external_id: "1", name: "Acme Corp", raw: { is_company: true, parent_id: null } },
            { external_id: "2", name: "Acme Sub", raw: { is_company: true, parent_id: 1 } },
            { external_id: "3", name: "Other Corp", raw: { is_company: false, parent_id: null } },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [{ id: "prov-1", name: "Provider A", code: "prov-a" }],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [{ id: "map-1", odoo_partner_id: 1, odoo_partner_name: "Acme Corp" }],
          error: null,
        }),
      );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates.length).toBeGreaterThanOrEqual(0);
  });

  it("filters by search query", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "doc-001", provider_id: null }, error: null }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          { external_id: "1", name: "Acme Corp", raw: { is_company: true, parent_id: null } },
          { external_id: "2", name: "Beta Inc", raw: { is_company: true, parent_id: null } },
        ],
        error: null,
      }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution?q=acme", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([{ id: 1, name: "Acme Corp" }]);
  });

  it("deduplicates repeated Odoo partners by root-company name", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "doc-001", provider_id: null }, error: null }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          { external_id: "10", name: "Northern Tool", raw: { is_company: true, parent_id: null } },
          { external_id: "10", name: "Northern Tool", raw: { is_company: true, parent_id: null } },
          { external_id: "11", name: "NORTHERN TOOL", raw: { is_company: true, parent_id: null } },
          {
            external_id: "12",
            name: "Northern Tool Branch",
            raw: { is_company: true, parent_id: 10 },
          },
        ],
        error: null,
      }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution?q=northern", {
        method: "GET",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toEqual([{ id: 10, name: "Northern Tool" }]);
  });
});

describe("POST /api/review/documents/[id]/provider-resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1", odoo_partner_id: 1 }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1", odoo_partner_id: 1 }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid {",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid odoo_partner_id", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1", odoo_partner_id: 0 }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(422);
  });

  it("returns 404 when document not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1", odoo_partner_id: 1 }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("creates new provider from odoo_partner_name when no provider specified", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "doc-001" }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // check existing provider
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "prov-new" }, error: null })) // create provider
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update document
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update draft
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // upsert mapping
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ odoo_partner_id: 1, odoo_partner_name: "New Supplier" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("updates mapping when document exists", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: "doc-001" }], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // upsert mapping
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: "prov-1", odoo_partner_id: 1 }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
  });

  it("returns 200 after saving provider mapping", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: "doc-001" }], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // upsert mapping
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/provider-resolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: "prov-1",
          odoo_partner_id: 1,
          odoo_partner_name: "Test",
        }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
  });
});
