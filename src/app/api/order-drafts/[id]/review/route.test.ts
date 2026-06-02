// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
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

const VALID_LINES = [
  { description: "Widget A", quantity: 2, unit_price: 50 },
  { description: "Widget B", quantity: 1, unit_price: 100 },
];

const VALID_PAYLOAD = { lines: VALID_LINES };

const EDITABLE_DRAFT = {
  id: DRAFT_ID,
  document_id: "doc-001",
  documents: { state: "needs_review" },
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/order-drafts/draft-001/review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/order-drafts/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await PATCH(makeReq(VALID_PAYLOAD) as never, ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(makeReq(VALID_PAYLOAD) as never, ctx))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const req = new Request("http://localhost/api/order-drafts/draft-001/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    const res = (await PATCH(req as never, ctx))!;
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request body" });
  });

  it("returns 422 when lines is not an array", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(makeReq({ lines: "not-an-array" }) as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "Line items are required" });
  });

  it("returns 404 when draft is not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(makeReq(VALID_PAYLOAD) as never, ctx))!;
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Order draft not found" });
  });

  it("returns 409 when document is not in needs_review state", async () => {
    const authClient = makeMockAuthClient();
    const processedDraft = { ...EDITABLE_DRAFT, documents: { state: "reviewed" } };
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: processedDraft, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(makeReq(VALID_PAYLOAD) as never, ctx))!;
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "Document is not editable" });
  });

  it("returns 422 when all lines normalize to empty", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: EDITABLE_DRAFT, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    // Empty lines array
    const res = (await PATCH(makeReq({ lines: [] }) as never, ctx))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      error: "At least one line item is required",
    });
  });

  it("returns 200 with saved draft and lines on success (new lines)", async () => {
    const savedDraft = { id: DRAFT_ID, po_number: null, total: 200 };
    const savedLines = [
      { id: "line-1", description: "Widget A", quantity: 2 },
      { id: "line-2", description: "Widget B", quantity: 1 },
    ];

    const authClient = makeMockAuthClient();
    // 1. tenant_members, 2. order_drafts (fetch draft), 3. order_drafts (fetch saved), 4. order_draft_lines (fetch saved)
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: EDITABLE_DRAFT, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: savedDraft, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: savedLines, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const noError = makeQueryBuilder({ data: null, error: null });
    // service.from calls: existing lines, insert×2, order_drafts update
    serviceClient.from.mockReturnValue(noError);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await PATCH(makeReq(VALID_PAYLOAD) as never, ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toMatchObject({ id: DRAFT_ID });
    expect(body.lines).toHaveLength(2);
  });

  it("returns 200 and deletes removed lines on update", async () => {
    const savedDraft = { id: DRAFT_ID, po_number: "PO-99", total: 50 };
    const savedLines = [{ id: "line-new", description: "Widget C", quantity: 1 }];

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: EDITABLE_DRAFT, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: savedDraft, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: savedLines, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const noError = makeQueryBuilder({ data: null, error: null });
    // Return existing line id that will be deleted (not in incoming payload)
    serviceClient.from
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ id: "line-old-1" }, { id: "line-old-2" }], error: null }),
      )
      .mockReturnValue(noError);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const payloadWithNewLine = {
      lines: [{ description: "Widget C", quantity: 1, unit_price: 50 }],
    };
    const res = (await PATCH(makeReq(payloadWithNewLine) as never, ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toMatchObject({ id: DRAFT_ID });
  });
});
