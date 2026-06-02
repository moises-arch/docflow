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

describe("GET /api/sidebar/document-costs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(new Request("http://localhost/api/sidebar/document-costs") as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(new Request("http://localhost/api/sidebar/document-costs") as never))!;
    expect(res.status).toBe(403);
  });

  it("returns empty items when no documents exist", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(new Request("http://localhost/api/sidebar/document-costs") as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  it("returns document cost list with extractions", async () => {
    const documents = [
      {
        id: "doc-1",
        original_name: "Invoice.pdf",
        state: "reviewed",
        created_at: "2026-04-27T00:00:00Z",
      },
    ];
    const extractions = [{ document_id: "doc-1", model_meta: { ai_cost_usd_actual: 0.15 } }];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: documents, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: extractions, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(new Request("http://localhost/api/sidebar/document-costs") as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].cost_usd).toBe(0.15);
  });

  it("returns items with null cost when no extraction exists", async () => {
    const documents = [
      {
        id: "doc-1",
        original_name: "Invoice.pdf",
        state: "reviewed",
        created_at: "2026-04-27T00:00:00Z",
      },
    ];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: documents, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(new Request("http://localhost/api/sidebar/document-costs") as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].cost_usd).toBeNull();
  });
});
