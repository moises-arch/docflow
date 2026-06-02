/**
 * Awaited invocation of a Supabase Edge Function from another Edge Function.
 *
 * Why: Deno isolates kill the worker shortly after the handler returns.
 * `void fetch(...)` (fire-and-forget) often does NOT actually send the request.
 * This helper awaits the response with a hard timeout so the caller stays alive
 * long enough for the request to ship.
 *
 * Returns parsed JSON body on success, throws on non-2xx or timeout.
 */
import { secrets } from "./secrets.ts";

export interface AwaitedInvokeOptions {
  /** Hard timeout in ms (default 25s) */
  timeoutMs?: number;
}

export async function awaitedInvoke<T = unknown>(
  fnName: string,
  payload: Record<string, unknown>,
  opts: AwaitedInvokeOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${secrets.supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secrets.supabaseServiceKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Edge fn ${fnName} returned ${res.status}: ${body.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
