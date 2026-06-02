// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { makeMockAuthClient, noMembership, okMembership } from "@/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const mockCreateClient = vi.mocked(createClient);

const req = (body: unknown) =>
  new Request("http://localhost/api/settings/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

type RpcClient = ReturnType<typeof makeMockAuthClient> & {
  rpc: ReturnType<typeof vi.fn>;
};

describe("POST /api/settings/team/invite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ email: "test@example.com" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "test@example.com" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not owner", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership("tenant-1", "member"));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "test@example.com" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/settings/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid email", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "not-an-email" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid role", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "user@example.com", role: "superadmin" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("invites user successfully via rpc", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    (authClient as RpcClient).rpc = vi
      .fn()
      .mockResolvedValue({ data: { user_id: "new-user" }, error: null });
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "newuser@example.com" }) as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 when rpc fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    (authClient as RpcClient).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "invite failed" } });
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "newuser@example.com" }) as never))!;
    expect(res.status).toBe(500);
  });

  it("returns 404 when user not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    (authClient as RpcClient).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "User not found" } });
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ email: "nobody@example.com" }) as never))!;
    expect(res.status).toBe(404);
  });
});
