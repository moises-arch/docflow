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
vi.mock("@/lib/browser-ingest/runner", () => ({
  runBrowserIngest: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { runBrowserIngest } from "@/lib/browser-ingest/runner";

const mockCreateClient = vi.mocked(createClient);
const mockRunBrowserIngest = vi.mocked(runBrowserIngest);

const req = (body: unknown) =>
  new Request("http://localhost/api/ingest/browser/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const CONNECTION = {
  id: "conn-1",
  tenant_id: "tenant-1",
  provider_id: "prov-1",
  name: "Test Portal",
  portal_url: "https://portal.example.com",
  login_url: null,
  selectors: {},
  settings: {},
};

describe("POST /api/ingest/browser/runs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);
    const res = (await POST(req({ connection_id: "conn-1" }) as never))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ connection_id: "conn-1" }) as never))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const badReq = new Request("http://localhost/api/ingest/browser/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid {",
    });
    const res = (await POST(badReq as never))!;
    expect(res.status).toBe(400);
  });

  it("returns 422 when connection_id is missing", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(okMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({}) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 404 when connection not found", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "not found" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ connection_id: "nonexistent" }) as never))!;
    expect(res.status).toBe(404);
  });

  it("returns 500 when run record creation fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [CONNECTION], error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: "insert failed" } }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(req({ connection_id: "conn-1" }) as never))!;
    expect(res.status).toBe(500);
  });

  it("runs browser ingest and returns result", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [CONNECTION], error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: "run-1" }], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    mockRunBrowserIngest.mockResolvedValue({
      state: "completed",
      documentsCreated: 3,
      artifacts: [{ url: "https://example.com/file.pdf" }],
    } as never);

    const res = (await POST(req({ connection_id: "conn-1" }) as never))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("run-1");
    expect(body.documents_created).toBe(3);
  });

  it("returns 500 when browser ingest throws", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: [CONNECTION], error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: "run-1" }], error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    mockRunBrowserIngest.mockRejectedValue(new Error("Puppeteer crashed"));

    const res = (await POST(req({ connection_id: "conn-1" }) as never))!;
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.id).toBe("run-1");
  });
});
