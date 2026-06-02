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
  new Request("http://localhost/api/settings/providers/target-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_BODY = {
  key: "partner_id",
  label: "Partner",
  scope: "header",
  target_model: "sale.order",
  target_field: "partner_id",
  value_type: "text",
  required: true,
};

describe("POST /api/settings/providers/target-fields", () => {
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

    const badReq = new Request("http://localhost/api/settings/providers/target-fields", {
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

    // Missing scope, target_model, target_field
    const res = (await POST(req({ key: "partner_id", label: "Partner" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid scope", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ ...VALID_BODY, scope: "invalid_scope" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("creates target field and returns item", async () => {
    const fieldData = {
      id: "tf-1",
      key: "partner_id",
      label: "Partner",
      scope: "header",
      required: true,
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: fieldData, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.key).toBe("partner_id");
  });

  it("returns 500 on insert failure", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "insert failed" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(500);
  });
});
