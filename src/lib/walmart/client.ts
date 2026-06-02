// Walmart Marketplace API client.
//
// Centralizes:
// - OAuth2 token management with in-process caching (14-min TTL with 1-min buffer)
// - Required headers (WM_SVC.NAME, WM_QOS.CORRELATION_ID, WM_SEC.ACCESS_TOKEN)
// - Retry with exponential backoff for 5xx
// - Rate limit handling (429 with Retry-After)
// - Per-request correlation IDs for distributed tracing
// - Timeout enforcement (10s default)
//
// All API surface lives in `lib/walmart/api/*.ts`; those files import this
// client for the underlying request mechanics.

import { randomUUID } from "crypto";

export const WALMART_API_BASE_URL =
  process.env.WALMART_API_BASE_URL ?? "https://marketplace.walmartapis.com";

const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_TTL_BUFFER_MS = 60_000; // refresh 1 min before stated expiry

// In-process token cache. Survives the lifetime of a lambda. If the lambda
// recycles, we just refresh on the next call — no harm done.
type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

export type WalmartRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  // Override default JSON; used by token endpoint.
  contentType?: string;
  rawBody?: string;
  // Stable correlation ID for the entire flow (webhook → process → call).
  // If absent, generates one. Logged + sent to Walmart in WM_QOS.CORRELATION_ID.
  correlationId?: string;
  // Override default 3 retries.
  maxRetries?: number;
  // Skip auth header (used internally by getAccessToken).
  skipAuth?: boolean;
};

export type WalmartApiError = Error & {
  status?: number;
  walmartCode?: string;
  correlationId?: string;
  body?: string;
};

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.WALMART_CLIENT_ID;
  const clientSecret = process.env.WALMART_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("walmart_credentials_missing");
  }
  return { clientId, clientSecret };
}

function buildBasicAuth(): string {
  const { clientId, clientSecret } = getCredentials();
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function refreshToken(correlationId: string): Promise<string> {
  const basic = buildBasicAuth();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const r = await fetch(`${WALMART_API_BASE_URL}/v3/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "WM_SVC.NAME": "Walmart Marketplace",
        "WM_QOS.CORRELATION_ID": correlationId,
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const err = new Error(`walmart_token_failed:HTTP ${r.status}`) as WalmartApiError;
      err.status = r.status;
      err.body = body.slice(0, 500);
      err.correlationId = correlationId;
      throw err;
    }

    const json = (await r.json()) as { access_token: string; expires_in: number };
    if (!json.access_token) {
      throw new Error("walmart_token_missing_in_response");
    }
    const expiresAt = Date.now() + json.expires_in * 1000 - TOKEN_TTL_BUFFER_MS;
    tokenCache = { token: json.access_token, expiresAt };
    return json.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAccessToken(correlationId?: string): Promise<string> {
  const cid = correlationId ?? randomUUID();
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  return refreshToken(cid);
}

function buildUrl(path: string, query?: WalmartRequestOptions["query"]): string {
  const url = new URL(path, WALMART_API_BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core request method with:
 * - automatic auth (unless skipAuth)
 * - retry with exponential backoff on 5xx (3 attempts default)
 * - Retry-After honored on 429
 * - correlation ID propagation
 * - JSON parsing (or raw text if non-JSON content-type)
 *
 * Returns parsed JSON body. Throws WalmartApiError on non-2xx.
 */
export async function walmartRequest<T = unknown>(
  options: WalmartRequestOptions,
): Promise<T> {
  const correlationId = options.correlationId ?? randomUUID();
  const maxRetries = options.maxRetries ?? 3;
  const url = buildUrl(options.path, options.query);
  const method = options.method ?? "GET";

  let lastError: WalmartApiError | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt += 1;

    let token: string | null = null;
    if (!options.skipAuth) {
      token = await getAccessToken(correlationId);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "WM_SVC.NAME": "Walmart Marketplace",
      "WM_QOS.CORRELATION_ID": correlationId,
    };
    if (token) headers["WM_SEC.ACCESS_TOKEN"] = token;

    let body: string | undefined;
    if (options.rawBody !== undefined) {
      body = options.rawBody;
      headers["Content-Type"] = options.contentType ?? "application/json";
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = options.contentType ?? "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      // Success path
      if (r.ok) {
        const contentType = r.headers.get("content-type") ?? "";
        if (r.status === 204 || !contentType.includes("application/json")) {
          return (await r.text()) as unknown as T;
        }
        return (await r.json()) as T;
      }

      // 401: token may be stale even though our cache thought it was valid.
      // Refresh once and retry immediately (don't count toward backoff).
      if (r.status === 401 && !options.skipAuth) {
        tokenCache = null;
        if (attempt < maxRetries + 1) {
          continue;
        }
      }

      // 429: respect Retry-After header
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get("retry-after") ?? "5", 10);
        const waitMs = Math.max(1000, retryAfter * 1000);
        if (attempt <= maxRetries) {
          await sleep(waitMs);
          continue;
        }
      }

      // 5xx: exponential backoff
      if (r.status >= 500 && r.status < 600 && attempt <= maxRetries) {
        const backoffMs = Math.min(2000, 100 * Math.pow(5, attempt - 1));
        await sleep(backoffMs);
        continue;
      }

      // Non-retriable (or out of retries)
      const errBody = await r.text().catch(() => "");
      const err = new Error(
        `walmart_api_error:${method} ${options.path} HTTP ${r.status}`,
      ) as WalmartApiError;
      err.status = r.status;
      err.body = errBody.slice(0, 500);
      err.correlationId = correlationId;
      lastError = err;
      throw err;
    } catch (err) {
      // Network/timeout errors: retry
      if (isAbortError(err) && attempt <= maxRetries) {
        const backoffMs = Math.min(2000, 100 * Math.pow(5, attempt - 1));
        await sleep(backoffMs);
        continue;
      }
      // Re-throw on last attempt or non-retriable errors
      if (lastError) throw lastError;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("walmart_request_exhausted_retries");
}

// Helper for tests / smoke checks: clear the cached token to force a refresh.
export function _resetTokenCacheForTesting(): void {
  tokenCache = null;
}
