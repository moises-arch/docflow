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
  new Request("http://localhost/api/settings/mappings/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_BODY = {
  extracted_name: "Acme Corp",
  odoo_partner_name: "Acme Corporation",
  odoo_partner_id: 42,
};

describe("POST /api/settings/mappings/customers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/settings/mappings/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 when required fields are missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    // Missing odoo_partner_name
    const res = (await POST(req({ extracted_name: "Acme" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("creates customer mapping and returns item", async () => {
    const mappingData = {
      id: "map-1",
      match_key: "Acme Corp",
      odoo_partner_name: "Acme Corporation",
      odoo_partner_id: 42,
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: mappingData, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.match_key).toBe("Acme Corp");
  });

  it("returns 500 when insert fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({ data: null, error: { message: "unique constraint" } }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(500);
  });
});
