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
  new Request("http://localhost/api/settings/providers/field-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_BODY = {
  provider_id: "prov-1",
  target_field_id: "tf-1",
  source_field_key: "partner_id",
};

describe("POST /api/settings/providers/field-mappings", () => {
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

  it("returns 400 for invalid JSON", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/settings/providers/field-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 when required fields missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ provider_id: "prov-1" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("creates field mapping and returns item", async () => {
    const mappingData = {
      id: "map-1",
      provider_id: "prov-1",
      target_field_id: "tf-1",
      source_field_key: "partner_id",
      source_field_label: null,
      active: true,
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: mappingData, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.source_field_key).toBe("partner_id");
  });

  it("returns 500 on upsert failure", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "upsert failed" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(500);
  });
});
