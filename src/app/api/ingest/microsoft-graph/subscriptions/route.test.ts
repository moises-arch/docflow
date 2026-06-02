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
  new Request("http://localhost/api/ingest/microsoft-graph/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/ingest/microsoft-graph/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ source_id: "src-1" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ source_id: "src-1" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/ingest/microsoft-graph/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 when source_id is missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({}) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 404 when email source not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ source_id: "nonexistent" }) as never))!;
    expect(res.status).toBe(404);
  });

  it("returns 422 when source is not microsoft_graph", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          {
            id: "src-1",
            tenant_id: "tenant-1",
            address: "test@example.com",
            settings: { adapter: "mailgun" },
          },
        ],
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ source_id: "src-1" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 500 when missing credentials", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          {
            id: "src-1",
            tenant_id: "tenant-1",
            address: "test@example.com",
            settings: { adapter: "microsoft_graph" },
          },
        ],
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    // Clear env vars
    const origTenant = process.env.MICROSOFT_GRAPH_TENANT_ID;
    const origClient = process.env.MICROSOFT_GRAPH_CLIENT_ID;
    const origSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
    delete process.env.MICROSOFT_GRAPH_TENANT_ID;
    delete process.env.MICROSOFT_GRAPH_CLIENT_ID;
    delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;

    const res = (await POST(req({ source_id: "src-1" }) as never))!;
    expect(res.status).toBe(500);

    process.env.MICROSOFT_GRAPH_TENANT_ID = origTenant;
    process.env.MICROSOFT_GRAPH_CLIENT_ID = origClient;
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET = origSecret;
  });

  it("returns 500 when webhook config is missing", async () => {
    process.env.MICROSOFT_GRAPH_TENANT_ID = "tenant-id";
    process.env.MICROSOFT_GRAPH_CLIENT_ID = "client-id";
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET = "secret";

    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          {
            id: "src-1",
            tenant_id: "tenant-1",
            address: "test@example.com",
            settings: { adapter: "microsoft_graph" },
          },
        ],
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const res = (await POST(req({ source_id: "src-1" }) as never))!;
    expect(res.status).toBe(500);

    process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
  });
});
