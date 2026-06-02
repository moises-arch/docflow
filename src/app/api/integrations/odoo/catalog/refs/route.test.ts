// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import {
  makeQueryBuilder,
  makeMockAuthClient,
  noMembership,
  okMembership,
} from "@/test/supabase-mock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";

const mockCreateClient = vi.mocked(createClient);

describe("GET /api/integrations/odoo/catalog/refs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(
      new Request("http://localhost/api/integrations/odoo/catalog/refs") as never,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/integrations/odoo/catalog/refs") as never,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns catalog references list", async () => {
    const refs = [{ id: "ref-1", name: "partners", version: "1.0" }];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: refs, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/integrations/odoo/catalog/refs") as never,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it("returns 500 when query fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "query failed" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/integrations/odoo/catalog/refs") as never,
    ))!;
    expect(res.status).toBe(500);
  });
});
