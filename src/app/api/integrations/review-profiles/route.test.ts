// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
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
  new Request("http://localhost/api/integrations/review-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/integrations/review-profiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(
      new Request("http://localhost/api/integrations/review-profiles") as never,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/integrations/review-profiles") as never,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns review profiles list", async () => {
    const profiles = [
      { id: "rp-1", name: "Default", slug: "default", document_kind: "invoice", active: true },
    ];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: profiles, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/integrations/review-profiles") as never,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

describe("POST /api/integrations/review-profiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ name: "New Profile", document_kind: "invoice" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "New Profile", document_kind: "invoice" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not owner", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership("tenant-1", "member"));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "New Profile", document_kind: "invoice" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 422 when document_kind is invalid", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Test Profile" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("creates review profile and returns item", async () => {
    const profileData = {
      id: "rp-new",
      name: "Custom Profile",
      slug: "custom-profile",
      document_kind: "invoice",
      active: true,
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: profileData, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Custom Profile", document_kind: "invoice" }) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.name).toBe("Custom Profile");
  });

  it("returns 500 when insert fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "insert error" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ name: "Custom Profile", document_kind: "invoice" }) as never))!;
    expect(res.status).toBe(500);
  });
});
