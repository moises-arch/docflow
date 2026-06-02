// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
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

const DRAFT_ID = "draft-001";
const ctx = { params: Promise.resolve({ id: DRAFT_ID }) };
const req = new Request("http://localhost/api/order-drafts/draft-001/approve", { method: "POST" });

const FULL_DRAFT = {
  id: DRAFT_ID,
  document_id: "doc-001",
  review_profile_id: "profile-001",
  provider_id: "provider-001",
  po_number: "PO-123",
  po_date: "2024-01-15",
  currency: "USD",
  buyer: { name: "Acme Corp" },
  shipping_address: { line1: "123 Main St" },
  billing_address: { line1: "456 Billing Ave" },
  payment_terms: "NET 30",
  notes: null,
};

const ONE_VALID_LINE = [
  {
    sku: "SKU-1",
    description: "Widget",
    quantity: 2,
    unit_price: 10.0,
    tax_rate: 0,
    odoo_product_id: 42,
  },
];

describe("POST /api/order-drafts/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when draft is not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Order draft not found" });
  });

  it("returns 422 when provider is unresolved (no review_profile_id)", async () => {
    const authClient = makeMockAuthClient();
    const draftWithoutProfile = { ...FULL_DRAFT, review_profile_id: null };
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: draftWithoutProfile, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "provider_unresolved" });
  });

  it("returns 422 when provider has no reseller mapping", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // no mapping
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "provider_unresolved" });
  });

  it("returns 422 when draft has no lines", async () => {
    const authClient = makeMockAuthClient();
    const mappingBuilder = makeQueryBuilder({ data: { id: "map-1" }, error: null });
    const emptyLinesBuilder = makeQueryBuilder({ data: [], error: null });
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(mappingBuilder)
      .mockReturnValueOnce(emptyLinesBuilder);
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "Order draft has no lines" });
  });

  it("returns 422 when required fields are missing", async () => {
    const draftMissingFields = { ...FULL_DRAFT, po_number: null };
    const authClient = makeMockAuthClient();
    const requiredPoField = {
      id: "field-1",
      key: "client_order_ref",
      label: "PO Number",
      scope: "header",
      required: true,
    };
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: draftMissingFields, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: ONE_VALID_LINE, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [requiredPoField], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("missing_required_fields");
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0].key).toBe("client_order_ref");
  });

  it("returns 422 when a required product is not resolved to Odoo", async () => {
    const authClient = makeMockAuthClient();
    const requiredProductField = {
      id: "field-product",
      key: "product_id",
      label: "Product",
      scope: "line",
      required: true,
    };
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ ...ONE_VALID_LINE[0], odoo_product_id: null }], error: null }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [requiredProductField], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: "missing_required_fields",
      fields: [expect.objectContaining({ key: "product_id" })],
    });
  });

  it("returns 422 when Odoo connection is inactive", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: ONE_VALID_LINE, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null })); // no required fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: { id: "conn-1", status: "inactive" }, error: null }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "odoo_connection_inactive" });
  });

  it("returns 502 when odoo-sync edge function responds with error", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: ONE_VALID_LINE, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const updateOk = makeQueryBuilder({ data: null, error: null });
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "conn-1", status: "active" }, error: null }),
      )
      .mockReturnValue(updateOk);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })),
    );

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "odoo_sync_failed" });
  });

  it("returns 200 with sync_state pending when approval succeeds", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: FULL_DRAFT, error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: ONE_VALID_LINE, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const noError = makeQueryBuilder({ data: null, error: null });
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "conn-1", status: "active" }, error: null }),
      )
      .mockReturnValue(noError);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      sync_state: "pending",
      sync_run_started: true,
    });
  });

  it("stores learned provider defaults from approved review edits", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: {
            ...FULL_DRAFT,
            currency: "eur",
            shipping_address: { line1: "77 Dock Rd", city: "Miami", state: "FL", zip: "33101" },
            billing_address: { line1: "88 Billing St", city: "Miami", state: "FL", zip: "33102" },
            payment_terms: "2%/30 NET 45",
            notes: "Leave at receiving dock",
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", provider_id: "provider-001", original_name: "PO-123.pdf" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: ONE_VALID_LINE, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const connectionBuilder = makeQueryBuilder({
      data: { id: "conn-1", status: "active" },
      error: null,
    });
    const providerSelectBuilder = makeQueryBuilder({
      data: {
        default_currency: "USD",
        settings: {
          keep_me: true,
          learned_defaults: { notes: "Old note" },
        },
      },
      error: null,
    });
    const providerUpdateBuilder = makeQueryBuilder({ data: null, error: null });
    const genericOk = makeQueryBuilder({ data: null, error: null });
    serviceClient.from
      .mockReturnValueOnce(connectionBuilder)
      .mockReturnValueOnce(providerSelectBuilder)
      .mockReturnValueOnce(providerUpdateBuilder)
      .mockReturnValue(genericOk);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = (await POST(req as never, ctx))!;
    expect(res.status).toBe(200);

    const providerUpdateCall = providerUpdateBuilder.update.mock.calls[0]?.[0] as
      | {
          default_currency?: string | null;
          settings?: { keep_me?: boolean; learned_defaults?: Record<string, unknown> };
        }
      | undefined;

    expect(providerUpdateCall?.default_currency).toBe("EUR");
    expect(providerUpdateCall?.settings?.keep_me).toBe(true);
    expect(providerUpdateCall?.settings?.learned_defaults).toMatchObject({
      currency: "EUR",
      delivery_address: "77 Dock Rd, Miami, FL 33101",
      billing_address: "88 Billing St, Miami, FL 33102",
      payment_terms: "2%/30 NET 45",
      notes: "Leave at receiving dock",
    });
  });
});
