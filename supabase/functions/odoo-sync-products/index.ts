import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { secrets } from "../_shared/secrets.ts";
import { decrypt } from "../_shared/crypto.ts";
import { odooCall } from "../_shared/odoo.ts";

interface SyncProductsPayload {
  tenant_id?: string;
  run_id?: string;
}

interface OdooConnection {
  baseUrl: string;
  database: string;
  username: string;
  password: string;
}

type OdooProduct = {
  id: number;
  name?: string;
  default_code?: string | false;
  barcode?: string | false;
  uom_id?: [number, string] | false;
  sale_ok?: boolean;
  active?: boolean;
  write_date?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;
const MAX_PRODUCTS = 20000;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

async function authenticate(conn: OdooConnection): Promise<number> {
  const uid = await odooCall(conn, "common", "authenticate", [
    conn.database,
    conn.username,
    conn.password,
    {},
  ]);
  if (typeof uid !== "number" || uid === 0) throw new Error("Odoo authentication failed");
  return uid;
}

async function executeKw(
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: SyncProductsPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const tenantId = payload.tenant_id;
  const runId = payload.run_id ?? null;
  if (!tenantId || !UUID_RE.test(tenantId)) return json({ error: "Invalid tenant_id" }, 400);

  const supabase = createServiceClient();
  const { data: connRow } = await supabase
    .from("odoo_connections")
    .select("base_url, database, username, api_key_enc, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!connRow || connRow.status !== "active") {
    return json({ error: "No active Odoo connection configured" }, 422);
  }

  try {
    const password = await decrypt(connRow.api_key_enc, secrets.intakeSecretsKey);
    const conn: OdooConnection = {
      baseUrl: connRow.base_url,
      database: connRow.database,
      username: connRow.username,
      password,
    };
    const uid = await authenticate(conn);

    let offset = 0;
    let imported = 0;
    const seenIds = new Set<number>();

    while (offset < MAX_PRODUCTS) {
      const products = (await executeKw(conn, uid, "product.product", "search_read", [[]], {
        fields: [
          "id",
          "name",
          "default_code",
          "barcode",
          "uom_id",
          "sale_ok",
          "active",
          "write_date",
        ],
        offset,
        limit: PAGE_SIZE,
        order: "name asc",
        context: { active_test: true },
      })) as OdooProduct[];

      if (!Array.isArray(products) || products.length === 0) break;

      const rows = products.map((product) => {
        seenIds.add(product.id);
        return {
          tenant_id: tenantId,
          odoo_product_id: product.id,
          name: product.name || `Product ${product.id}`,
          default_code: typeof product.default_code === "string" ? product.default_code : null,
          barcode: typeof product.barcode === "string" ? product.barcode : null,
          uom_name: Array.isArray(product.uom_id) ? product.uom_id[1] : null,
          sale_ok: product.sale_ok ?? true,
          active: product.active ?? true,
          raw: product,
          last_synced_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from("odoo_products")
        .upsert(rows, { onConflict: "tenant_id,odoo_product_id" });

      if (error) throw error;

      imported += rows.length;
      if (products.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // ── Reaper: marcar inactivos los productos cacheados que Odoo ya no devuelve.
    // Productos borrados en Odoo no aparecen en search_read y antes quedaban
    // como zombies activos en odoo_products, lo que hacía que ai-process los
    // siguiera mapeando en órdenes nuevas. Ahora se desactivan automáticamente.
    let deactivated = 0;
    if (seenIds.size > 0) {
      const { data: cached } = await supabase
        .from("odoo_products")
        .select("odoo_product_id")
        .eq("tenant_id", tenantId)
        .eq("active", true);
      const cachedIds = ((cached ?? []) as Array<{ odoo_product_id: number }>).map(
        (r) => r.odoo_product_id,
      );
      const stale = cachedIds.filter((id) => !seenIds.has(id));
      if (stale.length > 0) {
        const { error: deactivateErr } = await supabase
          .from("odoo_products")
          .update({ active: false, last_synced_at: new Date().toISOString() })
          .eq("tenant_id", tenantId)
          .in("odoo_product_id", stale);
        if (deactivateErr) throw deactivateErr;
        deactivated = stale.length;
      }
    }

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          imported,
          deactivated,
        })
        .eq("id", runId);
    }

    return json({ ok: true, imported, deactivated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (runId) {
      await supabase
        .from("odoo_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: message.slice(0, 500),
        })
        .eq("id", runId);
    }

    return json({ error: "Product sync failed", detail: message }, 500);
  }
});
