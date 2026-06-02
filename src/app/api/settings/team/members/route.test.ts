// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
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

type ServiceClientWithSchema = ReturnType<typeof makeMockServiceClient> & {
  schema: ReturnType<typeof vi.fn>;
};

describe("GET /api/settings/team/members", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(new Request("http://localhost/api/settings/team/members") as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(new Request("http://localhost/api/settings/team/members") as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 500 when members query fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: "db error" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(new Request("http://localhost/api/settings/team/members") as never))!;
    expect(res.status).toBe(500);
  });

  it("returns empty members list", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    // Mock schema().from().select().in() for auth users lookup
    (serviceClient as ServiceClientWithSchema).schema = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(new Request("http://localhost/api/settings/team/members") as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("returns members with emails merged in", async () => {
    const members = [
      { user_id: "user-1", role: "owner", created_at: "2026-04-01T00:00:00Z" },
      { user_id: "user-2", role: "member", created_at: "2026-04-02T00:00:00Z" },
    ];
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: members, error: null }));
    (serviceClient as ServiceClientWithSchema).schema = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { id: "user-1", email: "owner@example.com" },
              { id: "user-2", email: "member@example.com" },
            ],
            error: null,
          }),
        }),
      }),
    });
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await GET(new Request("http://localhost/api/settings/team/members") as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].email).toBe("owner@example.com");
  });
});
