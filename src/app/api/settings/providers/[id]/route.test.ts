// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./route";
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

const ctx = { params: Promise.resolve({ id: "prov-1" }) };

describe("DELETE /api/settings/providers/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await DELETE(
      new Request("http://localhost/api/settings/providers/prov-1", { method: "DELETE" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/providers/prov-1", { method: "DELETE" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when provider not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/providers/prov-1", { method: "DELETE" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("deletes provider successfully", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "prov-1" }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/providers/prov-1", { method: "DELETE" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 when delete fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { id: "prov-1" }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: null, error: { message: "delete failed" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await DELETE(
      new Request("http://localhost/api/settings/providers/prov-1", { method: "DELETE" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/settings/providers/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  function patchReq(body: unknown) {
    return new Request("http://localhost/api/settings/providers/prov-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never;
  }

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await PATCH(patchReq({ name: "X" }), ctx))!;
    expect(res.status).toBe(401);
  });

  it("returns 400 when no valid fields", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await PATCH(patchReq({ irrelevant: 1 }), ctx))!;
    expect(res.status).toBe(400);
  });

  it("updates name successfully", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const updated = { id: "prov-1", name: "New Name", code: "NN", default_currency: "USD", email_domains: [], settings: {}, status: "active" };
    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: updated, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await PATCH(patchReq({ name: "  New Name  " }), ctx))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.provider.name).toBe("New Name");
  });

  it("accepts valid status enum and rejects bogus", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const updated = { id: "prov-1", status: "paused" };
    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: updated, error: null }));
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const ok = (await PATCH(patchReq({ status: "paused" }), ctx))!;
    expect(ok.status).toBe(200);

    const authClient2 = makeMockAuthClient();
    authClient2.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient2 as never);
    const bad = (await PATCH(patchReq({ status: "bogus" }), ctx))!;
    expect(bad.status).toBe(400);
  });

  it("normalizes email_domains (trim + lowercase + drop empties)", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const updated = { id: "prov-1", email_domains: ["acme.com", "foo.io"] };
    const serviceClient = makeMockServiceClient();
    const builder = makeQueryBuilder({ data: updated, error: null });
    serviceClient.from.mockReturnValue(builder);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await PATCH(patchReq({ email_domains: ["  ACME.com ", "Foo.IO", ""] }), ctx))!;
    expect(res.status).toBe(200);
    const updateCall = builder.update.mock.calls[0]?.[0] as { email_domains: string[] };
    expect(updateCall.email_domains).toEqual(["acme.com", "foo.io"]);
  });

  it("scopes to tenant on update", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership("tenant-xyz"));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    const builder = makeQueryBuilder({ data: { id: "prov-1" }, error: null });
    serviceClient.from.mockReturnValue(builder);
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    await PATCH(patchReq({ name: "X" }), ctx);
    const eqCalls = builder.eq.mock.calls;
    expect(eqCalls).toContainEqual(["tenant_id", "tenant-xyz"]);
    expect(eqCalls).toContainEqual(["id", "prov-1"]);
  });
});
