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
  new Request("http://localhost/api/settings/providers/product-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_BODY = {
  provider_id: "prov-1",
  source_sku: "SKU-001",
  odoo_product_id: 42,
  odoo_product_name: "Widget A",
};

describe("POST /api/settings/providers/product-mappings", () => {
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

    const badReq = new Request("http://localhost/api/settings/providers/product-mappings", {
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

  it("creates product mapping and returns item", async () => {
    const mappingData = {
      id: "map-1",
      provider_id: "prov-1",
      source_sku: "SKU-001",
      odoo_product_id: 42,
      odoo_product_name: "Widget A",
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // no existing
      .mockReturnValueOnce(makeQueryBuilder({ data: mappingData, error: null })); // insert
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.odoo_product_name).toBe("Widget A");
  });

  it("updates existing mapping when duplicate odoo_product_id", async () => {
    const existingData = { id: "map-existing" };
    const updatedData = {
      id: "map-existing",
      provider_id: "prov-1",
      source_sku: "SKU-001",
      odoo_product_id: 42,
      odoo_product_name: "Widget A",
    };
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: existingData, error: null })) // existing found
      .mockReturnValueOnce(makeQueryBuilder({ data: updatedData, error: null })); // update
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.odoo_product_name).toBe("Widget A");
  });

  it("returns 500 on insert failure", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // no existing
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "insert failed" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req(VALID_BODY) as never))!;
    expect(res.status).toBe(500);
  });

  it("stores a confirmed SKU prefix rule on the provider settings", async () => {
    const mappingData = {
      id: "map-1",
      provider_id: "prov-1",
      source_sku: "ABC-SKU-001",
      odoo_product_id: 42,
      odoo_product_name: "Widget A",
    };
    const providerUpdate = makeQueryBuilder({ data: null, error: null });
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // no existing
      .mockReturnValueOnce(makeQueryBuilder({ data: mappingData, error: null })) // insert
      .mockReturnValueOnce(makeQueryBuilder({ data: { settings: { keep_me: true } }, error: null })) // provider settings
      .mockReturnValueOnce(providerUpdate); // provider update
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      req({
        ...VALID_BODY,
        source_sku: "ABC-SKU-001",
        sku_rule: { type: "strip_prefix", value: "ABC-" },
      }) as never,
    ))!;

    expect(res.status).toBe(201);
    expect(providerUpdate.update).toHaveBeenCalledWith({
      settings: {
        keep_me: true,
        sku_rules: [{ type: "strip_prefix", value: "ABC-" }],
      },
    });
  });
});
