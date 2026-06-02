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

const ctx = { params: Promise.resolve({ id: "doc-001" }) };

describe("POST /api/review/documents/[id]/create-template", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
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
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when document not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("creates provider with given name and code", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: "doc" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { provider_id: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // existing provider check
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "prov-new" }, error: null })) // create provider
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update document
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // update draft
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Acme Corp", code: "acme-corp" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.name).toBe("Acme Corp");
  });

  it("rejects when provider name not provided (no filename fallback)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: "Supplier Invoice" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { provider_id: null }, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("name_required");
  });

  it("rejects when name is a filename (.pdf, .xlsx, etc.)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: "4135040025.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { provider_id: null }, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "4135040025.pdf" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_name");
  });

  it("generates random code when name cannot be slugified", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: "---" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { provider_id: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "prov-new" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "---" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^provider-[a-f0-9]{8}$/);
  });

  it("reuses existing provider with same code", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: "test" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { provider_id: "prov-existing" }, error: null }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "prov-existing", name: "Test", code: "test" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update document
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // update draft
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider_id).toBe("prov-existing");
  });

  it("returns 500 when provider creation fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", tenant_id: "tenant-1", original_name: null },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { provider_id: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "insert failed" } }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/review/documents/doc-001/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Acme Corp" }),
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);
  });
});
