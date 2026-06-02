import chromium from "@sparticuz/chromium";
import { createHash, randomUUID } from "crypto";
import { chromium as playwrightChromium, type Browser, type Page } from "playwright-core";
import { createServiceClient } from "@/lib/supabase/service";

const DOCUMENT_BUCKET = "documents";
const MAX_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_EXTENSIONS = [
  ".pdf",
  ".csv",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

type Connection = {
  id: string;
  tenant_id: string;
  provider_id: string | null;
  name: string;
  portal_url: string;
  login_url: string | null;
  selectors: Record<string, unknown>;
  settings: Record<string, unknown>;
};

type RunInput = {
  runId: string;
  tenantId: string;
  userId: string;
  connection: Connection;
};

type StoredArtifact = {
  id: string;
  type: "download" | "screenshot" | "html" | "log";
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  documentId?: string | null;
  state: "stored" | "document_created" | "ignored" | "failed";
  meta?: Record<string, unknown>;
};

type DynamicDb = {
  from: (table: string) => {
    insert: (values: unknown) => {
      select?: (columns?: string) => unknown;
      then: PromiseLike<{ data: unknown; error: { message?: string } | null }>["then"];
    };
    update: (values: unknown) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        eq: (
          column: string,
          value: unknown,
        ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
  storage: ReturnType<typeof createServiceClient>["storage"];
};

function serviceClient() {
  return createServiceClient() as unknown as DynamicDb;
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/csv") return "csv";
  if (mimeType.includes("spreadsheet")) return "xlsx";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

function isDocumentMime(mimeType: string) {
  return [
    "application/pdf",
    "text/html",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
    "image/webp",
  ].includes(mimeType);
}

function safeName(value: string) {
  const name = value.split("?")[0]?.split("/").pop() || "artifact";
  return (
    decodeURIComponent(name)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 120) || "artifact"
  );
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function settingNumber(settings: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) {
    return playwrightChromium.launch({ executablePath, headless: true });
  }
  if (!process.env.VERCEL) {
    try {
      return await playwrightChromium.launch({ headless: true });
    } catch {
      // Fall through to the packaged runtime binary.
    }
  }
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

async function storeBytes(
  input: RunInput,
  artifact: Omit<StoredArtifact, "id" | "storagePath" | "sizeBytes" | "sha256" | "state"> & {
    bytes: Buffer;
  },
) {
  const service = serviceClient();
  const artifactId = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
  const extension = extensionFromMime(artifact.mimeType);
  const storagePath = `${input.tenantId}/browser/${month}/${input.runId}/${artifactId}.${extension}`;
  const checksum = sha256(artifact.bytes);

  const { error: uploadError } = await service.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, artifact.bytes, {
      contentType: artifact.mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  let documentId: string | null = null;
  let state: StoredArtifact["state"] = "stored";

  if (
    artifact.type === "download" &&
    isDocumentMime(artifact.mimeType) &&
    artifact.bytes.byteLength > 0 &&
    artifact.bytes.byteLength <= MAX_BYTES
  ) {
    documentId = randomUUID();
    const { error: documentError } = await service.from("documents").insert({
      id: documentId,
      tenant_id: input.tenantId,
      uploaded_by: input.userId,
      provider_id: input.connection.provider_id,
      original_name: artifact.originalName,
      storage_path: storagePath,
      mime_type: artifact.mimeType,
      size_bytes: artifact.bytes.byteLength,
      state: "uploaded",
      source_channel: "browser",
      source_ref: input.runId,
      source_meta: {
        browser_run_id: input.runId,
        browser_connection_id: input.connection.id,
        portal_url: input.connection.portal_url,
        checksum,
        ...artifact.meta,
      },
    });
    if (documentError) throw documentError;
    state = "document_created";
  }

  const { error: artifactError } = await service.from("browser_ingest_artifacts").insert({
    id: artifactId,
    tenant_id: input.tenantId,
    run_id: input.runId,
    document_id: documentId,
    artifact_type: artifact.type,
    storage_path: storagePath,
    original_name: artifact.originalName,
    mime_type: artifact.mimeType,
    size_bytes: artifact.bytes.byteLength,
    sha256: checksum,
    state,
    meta: artifact.meta ?? {},
  });
  if (artifactError) throw artifactError;

  if (documentId) {
    await invokeIngest(documentId, input.tenantId);
  }

  return {
    id: artifactId,
    type: artifact.type,
    storagePath,
    originalName: artifact.originalName,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.bytes.byteLength,
    sha256: checksum,
    documentId,
    state,
    meta: artifact.meta,
  } satisfies StoredArtifact;
}

async function invokeIngest(documentId: string, tenantId: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ document_id: documentId, tenant_id: tenantId }),
  }).catch((error: unknown) => {
    console.error("[browser-ingest] ingest trigger failed", error);
  });
}

async function downloadableLinks(page: Page, limit: number) {
  const pageUrl = page.url();
  const links = await page.$$eval(
    "a[href]",
    (anchors, extensions) =>
      anchors
        .map((anchor) => {
          const element = anchor as HTMLAnchorElement;
          return {
            href: element.href,
            text: element.textContent?.trim() ?? "",
            download: element.download || "",
          };
        })
        .filter((link) => {
          const href = link.href.toLowerCase().split("?")[0] ?? "";
          const text = `${link.text} ${link.download}`.toLowerCase();
          return (
            extensions.some(
              (extension) =>
                href.endsWith(extension) || link.download.toLowerCase().endsWith(extension),
            ) || /\b(pdf|csv|xlsx?|download|descargar|orden|order|purchase)\b/.test(text)
          );
        })
        .slice(0, 30),
    DOWNLOAD_EXTENSIONS,
  );
  const unique = new Map<string, { href: string; text: string; download: string }>();
  for (const link of links) {
    if (link.href && link.href !== pageUrl) unique.set(link.href, link);
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

async function fetchWithPageContext(page: Page, href: string) {
  const response = await page.request.get(href, { timeout: 30_000 });
  if (!response.ok()) throw new Error(`download_failed:${response.status()}`);
  const contentType =
    response.headers()["content-type"]?.split(";")[0]?.trim() || mimeFromName(href);
  const disposition = response.headers()["content-disposition"] ?? "";
  const filename = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  return {
    bytes: Buffer.from(await response.body()),
    mimeType: contentType,
    filename: filename ? safeName(filename) : safeName(href),
  };
}

export async function runBrowserIngest(input: RunInput) {
  const service = serviceClient();
  const startedAt = Date.now();
  const artifacts: StoredArtifact[] = [];
  let browser: Browser | null = null;

  try {
    await service
      .from("browser_ingest_runs")
      .update({ state: "running", started_at: new Date().toISOString() })
      .eq("id", input.runId)
      .eq("tenant_id", input.tenantId);

    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(settingNumber(input.connection.settings, "timeout_ms", 30_000));

    await page.goto(input.connection.login_url || input.connection.portal_url, {
      waitUntil: "domcontentloaded",
    });

    if (input.connection.login_url) {
      artifacts.push(
        await storeBytes(input, {
          type: "screenshot",
          originalName: "login-required.png",
          mimeType: "image/png",
          bytes: Buffer.from(await page.screenshot({ fullPage: true })),
          meta: { reason: "login_url_configured" },
        }),
      );
      await service
        .from("browser_ingest_runs")
        .update({
          state: "needs_attention",
          finished_at: new Date().toISOString(),
          artifacts_created: artifacts.length,
          error_code: "login_required",
          error_message: "Access approval is required before this portal can run automatically.",
          meta: { duration_ms: Date.now() - startedAt, current_url: page.url() },
        })
        .eq("id", input.runId)
        .eq("tenant_id", input.tenantId);
      return { state: "needs_attention" as const, artifacts, documentsCreated: 0 };
    }

    await page
      .waitForLoadState("networkidle", {
        timeout: settingNumber(input.connection.settings, "network_idle_ms", 10_000),
      })
      .catch(() => undefined);

    artifacts.push(
      await storeBytes(input, {
        type: "screenshot",
        originalName: "portal-screenshot.png",
        mimeType: "image/png",
        bytes: Buffer.from(await page.screenshot({ fullPage: true })),
        meta: { url: page.url() },
      }),
    );

    artifacts.push(
      await storeBytes(input, {
        type: "html",
        originalName: "portal.html",
        mimeType: "text/html",
        bytes: Buffer.from(await page.content(), "utf8"),
        meta: { url: page.url() },
      }),
    );

    const maxDownloads = settingNumber(input.connection.settings, "max_downloads", 5);
    const links = await downloadableLinks(page, maxDownloads);
    for (const link of links) {
      const download = await fetchWithPageContext(page, link.href);
      const bytes = download.bytes;
      if (bytes.byteLength > MAX_BYTES) continue;
      artifacts.push(
        await storeBytes(input, {
          type: "download",
          originalName: download.filename || safeName(link.download || link.href),
          mimeType: download.mimeType || mimeFromName(download.filename),
          bytes,
          meta: { href: link.href, text: link.text },
        }),
      );
    }

    const documentsCreated = artifacts.filter((artifact) => artifact.documentId).length;
    await service
      .from("browser_ingest_runs")
      .update({
        state: "processed",
        finished_at: new Date().toISOString(),
        documents_created: documentsCreated,
        artifacts_created: artifacts.length,
        meta: {
          duration_ms: Date.now() - startedAt,
          current_url: page.url(),
          links_found: links.length,
        },
      })
      .eq("id", input.runId)
      .eq("tenant_id", input.tenantId);

    await service
      .from("browser_ingest_connections")
      .update({ last_run_at: new Date().toISOString(), last_state: "processed" })
      .eq("id", input.connection.id)
      .eq("tenant_id", input.tenantId);

    return { state: "processed" as const, artifacts, documentsCreated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal capture failed";
    await service
      .from("browser_ingest_runs")
      .update({
        state: "failed",
        finished_at: new Date().toISOString(),
        artifacts_created: artifacts.length,
        error_code: "browser_ingest_failed",
        error_message: message,
        meta: { duration_ms: Date.now() - startedAt },
      })
      .eq("id", input.runId)
      .eq("tenant_id", input.tenantId);
    await service
      .from("browser_ingest_connections")
      .update({ last_run_at: new Date().toISOString(), last_state: "failed" })
      .eq("id", input.connection.id)
      .eq("tenant_id", input.tenantId);
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
