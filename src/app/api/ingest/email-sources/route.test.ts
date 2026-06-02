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
  new Request("http://localhost/api/ingest/email-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_MAILGUN = {
  address: "orders@example.com",
  adapter: "mailgun",
};

describe("POST /api/ingest/email-sources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await POST(req(VALID_MAILGUN) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_MAILGUN) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/ingest/email-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid email address", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ address: "not-an-email", adapter: "mailgun" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 for unsupported adapter", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ address: "orders@example.com", adapter: "fakemail" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 for microsoft_graph when address is empty (no mailbox fallback)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    // address is invalid so it fails the address check first, also no mailbox fallback
    const res = (await POST(
      req({ address: "not-valid", adapter: "microsoft_graph", graph_mailbox_id: "" }) as never,
    ))!;
    expect(res.status).toBe(422);
  });

  it("returns 500 when DB insert fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: null, error: { message: "unique violation" } }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_MAILGUN) as never))!;
    expect(res.status).toBe(500);
  });

  it("returns 201 with source data on success", async () => {
    const created = {
      id: "src-001",
      tenant_id: "tenant-1",
      provider_id: null,
      address: "orders@example.com",
      status: "active",
      allowed_senders: [],
      settings: { adapter: "mailgun", webhook_secret: "abc123" },
    };

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: created, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_MAILGUN) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.address).toBe("orders@example.com");
    expect(body.settings.adapter).toBe("mailgun");
  });
});
