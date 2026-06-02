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
  new Request("http://localhost/api/ingest/browser/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/ingest/browser/connections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ name: "Test", portal_url: "https://example.com" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test", portal_url: "https://example.com" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/ingest/browser/connections", {
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

    const res = (await POST(req({ portal_url: "https://example.com" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 when portal_url is invalid", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test", portal_url: "not a url" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 when login_url is provided but invalid", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({ name: "Test", portal_url: "https://example.com", login_url: "not a url" }) as never,
    ))!;
    expect(res.status).toBe(422);
  });

  it("creates connection with portal_url only (active status)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "conn-1",
          tenant_id: "tenant-1",
          provider_id: null,
          name: "Test Connection",
          portal_url: "https://example.com/",
          login_url: null,
          status: "active",
          last_run_at: null,
          last_state: null,
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({ name: "Test Connection", portal_url: "https://example.com" }) as never,
    ))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("active");
    expect(body.login_url).toBeNull();
  });

  it("creates connection with login_url (needs_attention status)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "conn-2",
          tenant_id: "tenant-1",
          provider_id: "prov-1",
          name: "Secure Connection",
          portal_url: "https://example.com/",
          login_url: "https://example.com/login",
          status: "needs_attention",
          last_run_at: null,
          last_state: null,
          created_at: "2026-04-27T00:00:00Z",
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({
        name: "Secure Connection",
        portal_url: "https://example.com",
        login_url: "https://example.com/login",
        provider_id: "prov-1",
      }) as never,
    ))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("needs_attention");
    expect(body.login_url).toBe("https://example.com/login");
  });

  it("returns 500 when database insert fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: null, error: { message: "unique constraint" } }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test", portal_url: "https://example.com" }) as never))!;
    expect(res.status).toBe(500);
  });
});
