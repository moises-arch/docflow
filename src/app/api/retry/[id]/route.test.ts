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
vi.mock("node:crypto", () => ({ randomUUID: () => "run-123" }));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const mockCreateClient = vi.mocked(createClient);
const mockCreateServiceClient = vi.mocked(createServiceClient);

const ctx = { params: Promise.resolve({ id: "doc-001" }) };

describe("POST /api/retry/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when document not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(404);
  });

  it("returns 409 when document is not in retryable state", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValueOnce(okMembership()).mockReturnValueOnce(
      makeQueryBuilder({
        data: { id: "doc-001", state: "reviewed", last_error: null },
        error: null,
      }),
    );
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(409);
  });

  it("returns 500 when env vars not configured", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", state: "failed_processing", last_error: "generic" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);

    process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  });

  it("retries odoo sync when applicable", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", state: "failed_processing", last_error: "odoo_sync_failed" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "draft-1", sync_state: "sync_failed" }, error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // draft update
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // document update
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retry_type).toBe("odoo_sync");
  });

  it("retries full ingest for other failures", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", state: "failed_processing", last_error: "some_error" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // no draft or different sync_state
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // document update
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 when draft update fails during odoo sync retry", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", state: "failed_processing", last_error: "odoo_sync_failed" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        makeQueryBuilder({ data: { id: "draft-1", sync_state: "sync_failed" }, error: null }),
      );
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(
      makeQueryBuilder({ data: null, error: { message: "update failed" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);
  });

  it("returns 500 when ingest reset fails", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:3000";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: "doc-001", state: "failed_processing", last_error: "some_error" },
          error: null,
        }),
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValueOnce(
      makeQueryBuilder({ data: null, error: { message: "update failed" } }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(
      new Request("http://localhost/api/retry/doc-001", { method: "POST" }) as never,
      ctx,
    ))!;
    expect(res.status).toBe(500);
  });
});
