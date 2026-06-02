interface OdooConnection {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
}

export type OdooFieldMeta = {
  string?: string;
  type?: string;
  relation?: string;
  required?: boolean;
  readonly?: boolean;
  store?: boolean;
  selectable?: boolean;
  help?: string;
  selection?: unknown;
};

const ODOO_TIMEOUT_MS = 30_000;
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);

async function odooCallOnce(
  conn: OdooConnection,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ODOO_TIMEOUT_MS);
  try {
    const res = await fetch(`${conn.baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: Math.floor(Math.random() * 100000),
        params: { service, method, args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw Object.assign(new Error(`Odoo HTTP error ${res.status}`), { httpStatus: res.status });
    }

    const body = (await res.json()) as {
      result?: unknown;
      error?: { data?: { message?: string } };
    };
    if (body.error) {
      throw new Error(body.error.data?.message ?? "Odoo RPC error");
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function odooCall(
  conn: OdooConnection,
  service: string,
  method: string,
  args: unknown[],
): Promise<unknown> {
  try {
    return await odooCallOnce(conn, service, method, args);
  } catch (err) {
    const isTransient =
      err instanceof Error &&
      (("httpStatus" in err &&
        TRANSIENT_HTTP.has((err as { httpStatus?: number }).httpStatus ?? 0)) ||
        err.name === "AbortError" ||
        err.message.includes("fetch failed") ||
        err.message.includes("network"));
    if (isTransient) {
      await new Promise((r) => setTimeout(r, 1500));
      return await odooCallOnce(conn, service, method, args);
    }
    throw err;
  }
}

export async function odooAuthenticate(conn: OdooConnection): Promise<number> {
  const uid = await odooCall(conn, "common", "authenticate", [
    conn.database,
    conn.username,
    conn.password,
    {},
  ]);

  if (typeof uid !== "number" || uid === 0) {
    throw new Error("Odoo authentication failed");
  }
  return uid;
}

export async function odooExecute(
  conn: OdooConnection,
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return odooCall(conn, "object", "execute_kw", [
    conn.database,
    uid,
    conn.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

export function toOdooConnection(row: {
  base_url: string;
  database: string;
  username: string;
  password: string;
}): OdooConnection {
  return {
    baseUrl: row.base_url,
    database: row.database,
    username: row.username,
    password: row.password,
  };
}
