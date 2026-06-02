// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  makeQueryBuilder,
  makeMockAuthClient,
  noMembership,
  okMembership,
} from "@/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const mockCreateClient = vi.mocked(createClient);

const req = (body: unknown) =>
  new Request("http://localhost/api/settings/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/settings/providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ name: "Test Provider" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test Provider" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/settings/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 when name is missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ code: "test-code" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("generates code from name when not provided", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "prov-1",
          name: "Test Provider",
          code: "test-provider",
          status: "active",
          default_currency: null,
          email_domains: [],
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test Provider" }) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.code).toBe("test-provider");
  });

  it("creates provider with custom code", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "prov-1",
          name: "Acme Corp",
          code: "acme",
          status: "active",
          default_currency: "USD",
          email_domains: ["acme.com", "acme.co"],
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({
        name: "Acme Corp",
        code: "acme",
        default_currency: "usd",
        email_domains: ["acme.com", "acme.co"],
      }) as never,
    ))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.name).toBe("Acme Corp");
    expect(body.item.default_currency).toBe("USD");
    expect(body.item.email_domains).toEqual(["acme.com", "acme.co"]);
  });

  it("slugifies code from name", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "prov-1",
          name: "Test Provider!",
          code: "test-provider",
          status: "active",
          default_currency: null,
          email_domains: [],
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test Provider!" }) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.code).toBe("test-provider");
  });

  it("filters and lowercases email domains", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "prov-1",
          name: "Test",
          code: "test",
          status: "active",
          default_currency: null,
          email_domains: ["example.com", "test.co"],
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({ name: "Test", email_domains: ["example.com", "", "test.co"] }) as never,
    ))!;
    expect(res.status).toBe(201);
  });

  it("returns 500 when insert fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: null, error: { message: "unique constraint" } }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test Provider" }) as never))!;
    expect(res.status).toBe(500);
  });
});
