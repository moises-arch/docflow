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

const ctx = { params: Promise.resolve({ id: "doc-001" }) };

describe("GET /api/review/documents/[id]/target-fields", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 500 when field fetch fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // draft
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "query error" } })); // fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);
  });

  it("returns fields without profile filter when no draft", async () => {
    const fields = [
      { id: "tf-1", key: "partner_id", label: "Partner", scope: "partner", required: true },
      { id: "tf-2", key: "amount", label: "Amount", scope: "line", required: true },
    ];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // draft
      .mockReturnValueOnce(makeQueryBuilder({ data: fields, error: null })); // fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields).toHaveLength(2);
  });

  it("filters fields by review profile when draft exists", async () => {
    const fields = [
      { id: "tf-1", key: "partner_id", label: "Partner", scope: "partner", required: true },
    ];
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { review_profile_id: "rp-1" }, error: null })) // draft
      .mockReturnValueOnce(makeQueryBuilder({ data: fields, error: null })); // fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields).toHaveLength(1);
  });

  it("returns empty fields array when no fields available", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // draft
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // fields
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await GET(
      new Request("http://localhost/api/review/documents/doc-001/target-fields") as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields).toEqual([]);
  });
});
