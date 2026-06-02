// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
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
  new Request("http://localhost/api/ingest/email-sources/src-001", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const ctx = { params: Promise.resolve({ id: "src-001" }) };

describe("PATCH /api/ingest/email-sources/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await PATCH(req({ status: "paused" }) as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ status: "paused" }) as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/ingest/email-sources/src-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "invalid json {",
    });
    const res = (await PATCH(badReq as never, ctx))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid status", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ status: "invalid_status" }) as never, ctx))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid adapter", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ adapter: "invalid_adapter" }) as never, ctx))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 when no changes provided", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({}) as never, ctx))!;
    expect(res.status).toBe(422);
  });

  it("updates status successfully", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "src-001", status: "paused", settings: {} }, error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ status: "paused" }) as never, ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paused");
  });

  it("updates allowed_senders as array", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: {
          id: "src-001",
          allowed_senders: ["alice@example.com", "bob@example.com"],
          settings: {},
        },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(
      req({ allowed_senders: ["Alice@Example.com", "Bob@Example.com"] }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed_senders).toHaveLength(2);
  });

  it("updates adapter with existing settings merge", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { settings: { webhook_secret: "abc123" } }, error: null }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: {
            id: "src-001",
            settings: { webhook_secret: "abc123", adapter: "mailgun" },
            error: null,
          },
          error: null,
        }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ adapter: "mailgun" }) as never, ctx))!;
    expect(res.status).toBe(200);
  });

  it("returns 500 when update fails", async () => {
    const authClient = makeMockAuthClient();
    // For a status update there are only 2 from() calls: membership + update
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: null, error: { message: "constraint violation" } }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(req({ status: "archived" }) as never, ctx))!;
    expect(res.status).toBe(500);
  });
});
