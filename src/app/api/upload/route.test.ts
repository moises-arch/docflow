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

function makeRequest(
  options: {
    type?: string;
    size?: number;
    name?: string;
    empty?: boolean;
    noFile?: boolean;
  } = {},
) {
  const {
    type = "application/pdf",
    size = 100,
    name = "order.pdf",
    empty = false,
    noFile = false,
  } = options;
  const formData = new FormData();
  if (!noFile) {
    const content = empty ? new Uint8Array(0) : new Uint8Array(size).fill(1);
    formData.append("file", new File([content], name, { type }));
  }
  return new Request("http://localhost/api/upload", { method: "POST", body: formData });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    // Default service-client mock — rate-limit calls it before auth checks finish.
    const defaultService = makeMockServiceClient();
    defaultService.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    mockCreateServiceClient.mockReturnValue(defaultService as never);
  });

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient(null) as never);

    const res = (await POST(makeRequest() as never))!;
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 when no file is provided", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient() as never);

    const res = (await POST(makeRequest({ noFile: true }) as never))!;
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "No file provided" });
  });

  it("returns 422 for disallowed MIME type", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient() as never);

    const res = (await POST(makeRequest({ type: "text/plain", name: "file.txt" }) as never))!;
    expect(res.status).toBe(422);
  });

  it("returns 422 when file exceeds 25 MB", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient() as never);

    const res = (await POST(makeRequest({ size: 26 * 1024 * 1024 }) as never))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "File exceeds the 25 MB limit" });
  });

  it("returns 422 for empty file", async () => {
    mockCreateClient.mockResolvedValue(makeMockAuthClient() as never);

    const res = (await POST(makeRequest({ empty: true }) as never))!;
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "File is empty" });
  });

  it("returns 403 when user has no active tenant", async () => {
    const authClient = makeMockAuthClient();
    authClient.from.mockReturnValue(noMembership());
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(makeRequest() as never))!;
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "No active tenant" });
  });

  it("returns 402 when credits are insufficient", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { balance: 0 }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const res = (await POST(makeRequest() as never))!;
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ error: "Insufficient credits" });
  });

  it("returns 500 when storage upload fails", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { balance: 10 }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    serviceClient.storage._bucket.upload.mockResolvedValue({
      data: null,
      error: { message: "disk full" },
    });
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(makeRequest() as never))!;
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: "Storage upload failed" });
  });

  it("returns 201 with documentId on successful upload", async () => {
    const authClient = makeMockAuthClient();
    authClient.from
      .mockReturnValueOnce(okMembership())
      .mockReturnValueOnce(makeQueryBuilder({ data: { balance: 10 }, error: null }));
    mockCreateClient.mockResolvedValue(authClient as never);

    const serviceClient = makeMockServiceClient();
    serviceClient.from.mockReturnValue(
      makeQueryBuilder({ data: { id: "doc-abc-123" }, error: null }),
    );
    mockCreateServiceClient.mockReturnValue(serviceClient as never);

    const res = (await POST(makeRequest() as never))!;
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ documentId: "doc-abc-123" });
  });
});
