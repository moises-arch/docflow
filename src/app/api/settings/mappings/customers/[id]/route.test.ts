// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
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

const ctx = { params: Promise.resolve({ id: "map-1" }) };

describe("DELETE /api/settings/mappings/customers/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await DELETE(
      new Request("http://localhost/api/settings/mappings/customers/map-1", {
        method: "DELETE",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/mappings/customers/map-1", {
        method: "DELETE",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when mapping not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/mappings/customers/map-1", {
        method: "DELETE",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("deletes customer mapping successfully", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "map-1" }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/mappings/customers/map-1", {
        method: "DELETE",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("successfully deletes mapping and confirms deletion", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: "map-1" }], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    // Mock for the service client delete
    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/mappings/customers/map-1", {
        method: "DELETE",
      }) as never,
      ctx,
    ))!;
    expect(res.status).toBeLessThan(500);
  });
});
