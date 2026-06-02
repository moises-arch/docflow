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

const ctx = { params: Promise.resolve({ id: "prov-1" }) };

function req(url = "http://localhost/api/settings/providers/prov-1/documents") {
  return new Request(url, { method: "GET" }) as never;
}

describe("GET /api/settings/providers/[id]/documents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 without tenant", async () => {
    const auth = makeMockAuthClient();
    auth.from.mockReturnValueOnce(noMembership());
    mockCreateClient.mockResolvedValue(auth as never);
    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(403);
  });

  it("filters by provider_id and tenant_id and joins drafts", async () => {
    const auth = makeMockAuthClient();
    const docsBuilder = makeQueryBuilder({
      data: [
        {
          id: "d1",
          doc_number: "D-1",
          original_name: "x.pdf",
          state: "needs_review",
          storage_path: "x",
          created_at: "2026-05-04T10:00:00Z",
          updated_at: "2026-05-04T10:00:00Z",
        },
      ],
      error: null,
    });
    const draftsBuilder = makeQueryBuilder({
      data: [
        {
          id: "dr1",
          document_id: "d1",
          po_number: "PO-1",
          buyer: { name: "ACME" },
          total: 100,
          currency: "USD",
          sync_state: "pending",
          odoo_so_id: null,
          odoo_so_name: null,
        },
      ],
      error: null,
    });
    auth.from
      .mockReturnValueOnce(okMembership("tenant-1"))
      .mockReturnValueOnce(docsBuilder)
      .mockReturnValueOnce(draftsBuilder);
    mockCreateClient.mockResolvedValue(auth as never);

    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].documentId).toBe("d1");
    expect(body.items[0].poNumber).toBe("PO-1");
    expect(body.items[0].customerName).toBe("ACME");
    expect(body.nextCursor).toBeNull();

    const eqCalls = docsBuilder.eq.mock.calls;
    expect(eqCalls).toContainEqual(["tenant_id", "tenant-1"]);
    expect(eqCalls).toContainEqual(["provider_id", "prov-1"]);
  });

  it("paginates with nextCursor when more rows exist", async () => {
    const auth = makeMockAuthClient();
    // Return limit+1 rows to trigger nextCursor
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `d${i}`,
      doc_number: null,
      original_name: `f${i}.pdf`,
      state: "reviewed",
      storage_path: "p",
      created_at: `2026-05-${String(50 - i).padStart(2, "0")}T00:00:00Z`,
      updated_at: "2026-05-04T10:00:00Z",
    }));
    const docsBuilder = makeQueryBuilder({ data: rows, error: null });
    const draftsBuilder = makeQueryBuilder({ data: [], error: null });
    auth.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(docsBuilder)
      .mockReturnValueOnce(draftsBuilder);
    mockCreateClient.mockResolvedValue(auth as never);

    const res = (await GET(req(), ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(50);
    expect(body.nextCursor).toBe(rows[49].created_at);
  });
});
