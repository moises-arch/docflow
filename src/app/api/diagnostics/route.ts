import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DiagResult {
  id: string;
  category: string;
  label: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  ms?: number;
}

async function test(
  id: string,
  category: string,
  label: string,
  fn: () => Promise<{ ok: boolean; msg: string; warn?: boolean }>,
): Promise<DiagResult> {
  const t0 = Date.now();
  try {
    const { ok, msg, warn } = await fn();
    return { id, category, label, status: warn ? "warn" : ok ? "pass" : "fail", message: msg, ms: Date.now() - t0 };
  } catch (e) {
    return { id, category, label, status: "fail", message: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Diagnostics expose env-var presence and internal state — restrict to owners.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "owner") {
    return new Response("Forbidden", { status: 403 });
  }
  const tenantId = membership.tenant_id ?? "";

  const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const svc = svcUrl && svcKey ? createServiceClient(svcUrl, svcKey) : null;

  // Use request origin for self-pings so local dev works regardless of APP_URL
  const requestOrigin = new URL(request.url).origin;
  const origin = requestOrigin;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(r: DiagResult) {
        controller.enqueue(encoder.encode(JSON.stringify(r) + "\n"));
      }

      // ╔══════════════════════════════════════════════════════╗
      // ║  RUNTIME                                             ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("rt_node", "RUNTIME", "Node.js version", async () => {
        const version = process.version;
        const major = parseInt(version.replace("v", "").split(".")[0]);
        return { ok: major >= 22, warn: major < 22, msg: `${version} (requerido >=22)` };
      }));

      send(await test("rt_memory", "RUNTIME", "Heap memory usage", async () => {
        const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const total = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
        const isDev = process.env.NODE_ENV !== "production";
        // In dev, turbopack uses 1–3GB normally — not a real issue
        const threshold = isDev ? 4096 : 512;
        return {
          ok: mb < threshold,
          warn: mb >= threshold,
          msg: `${mb}MB / ${total}MB${isDev ? " (dev — turbopack normal)" : mb >= threshold ? " — alto" : " ✓"}`,
        };
      }));

      send(await test("rt_env", "RUNTIME", "NODE_ENV", async () => {
        const env = process.env.NODE_ENV ?? "unknown";
        // development is expected — only warn in production if somehow wrong
        if (env === "production") return { ok: true, msg: "production ✓" };
        return { ok: true, warn: false, msg: `${env} (entorno local)` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  ENV VARS                                            ║
      // ╚══════════════════════════════════════════════════════╝
      const envChecks: Array<[string, string, boolean]> = [
        ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", true],
        ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", true],
        ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", true],
        ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL ?? "", true],
        ["CRON_SECRET", process.env.CRON_SECRET ?? "", false],
        ["SCAN_TOKEN_SECRET", process.env.SCAN_TOKEN_SECRET ?? "", false],
      ];
      const isLocalDev = process.env.NODE_ENV !== "production";
      for (const [name, val, required] of envChecks) {
        send(await test(`env_${name.toLowerCase()}`, "ENV", `ENV · ${name}`, async () => {
          // Never expose any portion of the secret value — only presence/length.
          if (val.length > 0) return { ok: true, msg: `Set ✓ (${val.length} chars)` };
          if (required) return { ok: false, msg: "MISSING — requerida" };
          // Optional vars missing in local dev are informational, not warnings
          return { ok: true, warn: !isLocalDev, msg: isLocalDev ? "Not set (ok en local)" : "Not set — requerida en producción" };
        }));
      }

      // ╔══════════════════════════════════════════════════════╗
      // ║  SUPABASE — DATABASE                                 ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("db_auth", "SUPABASE", "DB · Auth session válida", async () => ({
        ok: !!user, msg: `Authenticated as ${user.email}`,
      })));

      send(await test("db_latency", "SUPABASE", "DB · Latencia de conexión", async () => {
        const t0 = Date.now();
        const { error } = await supabase.from("tenant_members").select("tenant_id").limit(1);
        const ms = Date.now() - t0;
        return { ok: !error && ms < 800, warn: !error && ms >= 800, msg: error ? error.message : `${ms}ms${ms >= 800 ? " — lento" : " ✓"}` };
      }));

      send(await test("db_rls", "SUPABASE", "DB · RLS en tenant_members", async () => {
        const { data, error } = await supabase.from("tenant_members").select("tenant_id").limit(1);
        return { ok: !error, msg: error ? `RLS error: ${error.message}` : `OK — ${data?.length ?? 0} row(s) visible` };
      }));

      send(await test("db_storage_bucket", "SUPABASE", "DB · Storage bucket 'documents'", async () => {
        // Use service role — regular user client cannot read bucket metadata
        if (!svc) return { ok: false, msg: "Service role key missing" };
        const { data, error } = await svc.storage.getBucket("documents");
        if (!data && error) {
          return { ok: false, warn: true, msg: `${error.message} — crear bucket "documents" en Supabase Storage` };
        }
        return { ok: true, msg: `OK — public: ${data!.public}` };
      }));

      send(await test("db_rate_limit_table", "SUPABASE", "DB · Tabla rate_limit_buckets", async () => {
        if (!svc) return { ok: false, msg: "Service role key missing" };
        const { error } = await svc.from("rate_limit_buckets").select("key").limit(1);
        return { ok: !error, msg: error ? error.message : "Accessible ✓" };
      }));

      send(await test("db_workflow_events", "SUPABASE", "DB · Tabla workflow_events", async () => {
        const { count, error } = await supabase.from("workflow_events").select("*", { count: "exact", head: true });
        return { ok: !error, msg: error ? error.message : `${count ?? 0} events` };
      }));

      send(await test("db_credit_balance", "SUPABASE", "DB · Credit balance del tenant", async () => {
        const { data, error } = await supabase.from("credit_balances").select("balance").single();
        if (error) return { ok: false, msg: error.message };
        const bal = data?.balance ?? 0;
        return { ok: bal >= 0, warn: bal < 10, msg: `Balance: ${bal} créditos${bal < 10 ? " — bajo" : " ✓"}` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  PIPELINE                                            ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("docs_total", "PIPELINE", "Docs · Total en DB", async () => {
        const { count, error } = await supabase.from("documents").select("*", { count: "exact", head: true });
        return { ok: !error, msg: error ? error.message : `${count ?? 0} documentos` };
      }));

      send(await test("docs_stuck", "PIPELINE", "Docs · Atascados en 'processing' >30m", async () => {
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { count } = await supabase.from("documents").select("*", { count: "exact", head: true })
          .eq("state", "processing").lt("created_at", cutoff);
        const n = count ?? 0;
        return { ok: n === 0, warn: n > 0, msg: n === 0 ? "Ninguno atascado ✓" : `${n} documento(s) >30min` };
      }));

      send(await test("docs_failed_24h", "PIPELINE", "Docs · Fallidos (últimas 24h)", async () => {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase.from("documents").select("*", { count: "exact", head: true })
          .eq("state", "failed").gte("created_at", cutoff);
        const n = count ?? 0;
        return { ok: n === 0, warn: n > 0, msg: n === 0 ? "Sin fallos recientes ✓" : `${n} fallido(s) en 24h` };
      }));

      send(await test("drafts_pending", "PIPELINE", "Order Drafts · Pendientes de sync", async () => {
        const { count, error } = await supabase.from("order_drafts").select("*", { count: "exact", head: true })
          .eq("sync_state", "pending");
        return { ok: !error, warn: (count ?? 0) > 50, msg: error ? error.message : `${count ?? 0} pendientes${(count ?? 0) > 50 ? " — acumulados" : ""}` };
      }));

      send(await test("sync_failed_24h", "PIPELINE", "Odoo Sync · Intentos fallidos (24h)", async () => {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase.from("odoo_sync_attempts").select("*", { count: "exact", head: true })
          .eq("outcome", "failed").gte("started_at", cutoff);
        const n = count ?? 0;
        return { ok: n === 0, warn: n > 0, msg: n === 0 ? "Sin fallos ✓" : `${n} intento(s) fallido(s)` };
      }));

      send(await test("extractions_recent", "PIPELINE", "Extractions · Última extracción", async () => {
        const { data } = await supabase.from("extractions").select("created_at, confidence")
          .order("created_at", { ascending: false }).limit(1).single();
        if (!data) return { ok: true, warn: false, msg: "Sin extracciones (normal si no hay docs)" };
        const age = Math.round((Date.now() - new Date(data.created_at).getTime()) / 3600000);
        const conf = typeof data.confidence === "number" ? `conf: ${(data.confidence * 100).toFixed(0)}%` : "";
        return { ok: true, warn: age > 72, msg: `Hace ${age}h ${conf}` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  TENANT CONFIG                                       ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("tenant_settings", "TENANT", "Tenant · Settings configurados", async () => {
        const { data, error } = await supabase.from("tenants").select("name, locale, auto_approve_clean").single();
        if (error || !data) return { ok: false, msg: error?.message ?? "No tenant found" };
        return { ok: true, msg: `${data.name} — locale: ${data.locale ?? "default"}, auto_approve: ${data.auto_approve_clean ?? false}` };
      }));

      send(await test("review_profiles", "TENANT", "Tenant · Review profiles configurados", async () => {
        const { count } = await supabase.from("review_profiles").select("*", { count: "exact", head: true }).eq("active", true);
        return { ok: (count ?? 0) > 0, warn: (count ?? 0) === 0, msg: `${count ?? 0} profile(s) activo(s)` };
      }));

      send(await test("email_sources", "TENANT", "Tenant · Email ingest configurado", async () => {
        const { count } = await supabase.from("email_ingest_sources").select("*", { count: "exact", head: true });
        const n = count ?? 0;
        if (n > 0) return { ok: true, msg: `${n} fuente(s) de email activa(s) ✓` };
        // Not configured is informational — email ingest is optional
        return { ok: true, warn: false, msg: "Sin fuentes configuradas (opcional — configurar en Ingest si se necesita)" };
      }));

      // Get reseller count first — if > 0, product/customer mappings are not required
      const { count: resellerCount } = await supabase
        .from("provider_reseller_mappings").select("*", { count: "exact", head: true });
      const hasResellerMappings = (resellerCount ?? 0) > 0;

      send(await test("product_mappings", "TENANT", "Tenant · Product mappings", async () => {
        const { count } = await supabase.from("product_mappings").select("*", { count: "exact", head: true });
        const n = count ?? 0;
        if (n > 0) return { ok: true, msg: `${n} mapping(s) ✓` };
        if (hasResellerMappings) return { ok: true, msg: "0 directos — cubierto por reseller mappings ✓" };
        return { ok: true, warn: !isLocalDev, msg: isLocalDev ? "Sin mappings (ok en local)" : "0 mappings — sync puede fallar sin mappings de productos" };
      }));

      send(await test("reseller_mappings", "TENANT", "Tenant · Reseller mappings", async () => ({
        ok: true,
        warn: false,
        msg: `${resellerCount ?? 0} reseller mapping(s)${(resellerCount ?? 0) > 0 ? " ✓" : ""}`,
      })));

      send(await test("customer_mappings", "TENANT", "Tenant · Customer mappings", async () => {
        const { count } = await supabase.from("customer_mappings").select("*", { count: "exact", head: true });
        const n = count ?? 0;
        if (n > 0) return { ok: true, msg: `${n} mapping(s) ✓` };
        if (hasResellerMappings) return { ok: true, msg: "0 directos — cubierto por reseller mappings ✓" };
        return { ok: true, warn: !isLocalDev, msg: isLocalDev ? "Sin mappings (ok en local)" : "0 mappings — sync puede fallar sin mappings de clientes" };
      }));

      send(await test("providers_active", "TENANT", "Tenant · Providers activos", async () => {
        const { count } = await supabase.from("providers").select("*", { count: "exact", head: true });
        return { ok: true, warn: (count ?? 0) === 0, msg: `${count ?? 0} provider(s)` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  SEGURIDAD                                           ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("sec_ai_key_enc", "SEGURIDAD", "Seg · AI key encriptada (api_key_enc)", async () => {
        const { data } = await supabase.from("ai_connections").select("api_key_enc").limit(1).single();
        if (!data) return { ok: true, warn: false, msg: "Sin conexión AI configurada" };
        // Empty key is a warn (not fail) — may be using env-based key instead
        if (data.api_key_enc.length === 0)
          return { ok: false, warn: true, msg: "api_key_enc vacío — verificar que la clave está siendo persistida correctamente" };
        return { ok: true, msg: "Key cifrada ✓" };
      }));

      send(await test("sec_odoo_key_enc", "SEGURIDAD", "Seg · Odoo key encriptada (api_key_enc)", async () => {
        const { data } = await supabase.from("odoo_connections").select("api_key_enc").limit(1).single();
        if (!data) return { ok: true, warn: false, msg: "Sin conexión Odoo configurada" };
        return { ok: data.api_key_enc.length > 20, warn: data.api_key_enc.length <= 20, msg: data.api_key_enc.length > 20 ? "Key cifrada ✓" : "api_key_enc vacío" };
      }));

      send(await test("sec_scan_token", "SEGURIDAD", "Seg · Scan token sign/verify roundtrip", async () => {
        const { signScanToken, verifyScanToken } = await import("@/lib/scan-token");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const token = signScanToken({ tenant_id: "diag-test", user_id: user.id, exp });
        const verified = verifyScanToken(token);
        return { ok: !!verified && verified.tenant_id === "diag-test", msg: verified ? "Sign + verify OK ✓" : "Verificación falló — revisar SCAN_TOKEN_SECRET" };
      }));

      send(await test("sec_auth_redirect", "SEGURIDAD", "Seg · APP_URL formato válido (producción)", async () => {
        const url = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
        if (isLocal) return { ok: true, warn: false, msg: `${url} (entorno local — ok)` };
        const valid = url.startsWith("https://") && !url.endsWith("/");
        return { ok: valid, warn: !valid, msg: valid ? `${url} ✓` : `"${url}" — debe empezar con https:// y sin slash final` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  AI (ANTHROPIC)                                      ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("ai_conn_status", "ANTHROPIC", "Anthropic · Conexión en DB", async () => {
        const { data } = await supabase.from("ai_connections").select("primary_model, status, last_checked_at, last_error").limit(1).single();
        if (!data) return { ok: false, msg: "Sin conexión — configurar en Settings → AI" };
        const lastCheck = data.last_checked_at ? Math.round((Date.now() - new Date(data.last_checked_at).getTime()) / 3600000) : null;
        const hasErr = !!data.last_error;
        return {
          ok: data.status === "active" && !hasErr,
          warn: data.status === "active" && hasErr,
          msg: `${data.primary_model} — ${data.status}${lastCheck !== null ? ` — verificado hace ${lastCheck}h` : ""}${hasErr ? ` — error: ${data.last_error}` : ""}`,
        };
      }));

      send(await test("ai_api_ping", "ANTHROPIC", "Anthropic · API reachable desde servidor", async () => {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": "diag-probe", "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(5000),
        });
        // 401 = server reachable + auth required (expected without real key)
        // 403 = also reachable
        const reachable = res.status === 401 || res.status === 403 || res.status === 200;
        return { ok: reachable, msg: reachable ? `Reachable — HTTP ${res.status} ✓` : `HTTP ${res.status} — posible bloqueo de red` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  ODOO                                                ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("odoo_conn_status", "ODOO", "Odoo · Conexión en DB", async () => {
        const { data } = await supabase.from("odoo_connections").select("base_url, status, last_checked_at, last_error").limit(1).single();
        if (!data) return { ok: false, warn: true, msg: "Sin conexión — configurar en Settings → Odoo" };
        const lastCheck = data.last_checked_at ? Math.round((Date.now() - new Date(data.last_checked_at).getTime()) / 3600000) : null;
        return {
          ok: data.status === "active",
          warn: data.status !== "active",
          msg: `${data.base_url} — ${data.status}${lastCheck !== null ? ` — verificado hace ${lastCheck}h` : ""}${data.last_error ? ` — error: ${data.last_error}` : ""}`,
        };
      }));

      send(await test("odoo_xmlrpc_ping", "ODOO", "Odoo · XML-RPC reachable", async () => {
        const { data } = await supabase.from("odoo_connections").select("base_url").limit(1).single();
        if (!data?.base_url) return { ok: false, warn: true, msg: "Sin base_url configurado" };
        const base = data.base_url.replace(/\/$/, "");
        const body = `<?xml version='1.0'?><methodCall><methodName>version</methodName><params></params></methodCall>`;
        const headers = { "Content-Type": "text/xml" };
        const sig = AbortSignal.timeout(6000);

        // Try Odoo 16+/17+ path first, fallback to legacy path
        for (const path of ["/xmlrpc/2/common", "/web/xmlrpc/2/common"]) {
          const res = await fetch(`${base}${path}`, { method: "POST", headers, body, signal: sig })
            .catch(() => null);
          if (!res) continue;
          if (res.status === 200) return { ok: true, msg: `HTTP 200 — ${path} ✓` };
          if (res.status !== 404) return { ok: res.status < 500, warn: res.status >= 400, msg: `HTTP ${res.status} — ${path}` };
        }
        return { ok: false, warn: true, msg: "XML-RPC endpoints no encontrados (404 en ambas rutas) — verificar configuración del servidor" };
      }));

      send(await test("odoo_catalog_count", "ODOO", "Odoo · Productos en catálogo local", async () => {
        const { count } = await supabase.from("odoo_products").select("*", { count: "exact", head: true });
        return { ok: true, warn: (count ?? 0) === 0, msg: `${count ?? 0} producto(s) sincronizados` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  EDGE FUNCTIONS                                      ║
      // ╚══════════════════════════════════════════════════════╝
      const edgeFunctions = ["ai-process", "odoo-sync", "ingest", "email-ingest", "janitor-uploads"];
      const edgeBase = svcUrl.replace(/\/$/, "");

      for (const fn of edgeFunctions) {
        send(await test(`edge_${fn.replace(/-/g, "_")}`, "EDGE FUNCTIONS", `Edge · ${fn}`, async () => {
          const res = await fetch(`${edgeBase}/functions/v1/${fn}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: AbortSignal.timeout(8000),
          }).catch(e => ({ status: 0, err: (e as Error).message }));
          if ("err" in res) return { ok: false, msg: `No reachable: ${res.err}` };
          // 401/403 = deployed and running, auth required (expected)
          const deployed = res.status === 401 || res.status === 403 || res.status === 200 || res.status === 400;
          return { ok: deployed, warn: !deployed && res.status !== 404, msg: deployed ? `HTTP ${res.status} — deployed ✓` : `HTTP ${res.status} — posiblemente no deployado` };
        }));
      }

      // ╔══════════════════════════════════════════════════════╗
      // ║  API ENDPOINTS                                       ║
      // ╚══════════════════════════════════════════════════════╝
      const apiChecks: Array<[string, string, "GET" | "POST", number[]]> = [
        ["api_health", "/api/health", "GET", [200]],
        ["api_upload", "/api/upload", "POST", [400, 401]],
        ["api_scan_links", "/api/scan-links", "POST", [200, 401]],
        ["api_sidebar", "/api/sidebar/document-costs", "GET", [200, 401]],
      ];

      for (const [id, path, method, expected] of apiChecks) {
        send(await test(id, "API", `API · ${method} ${path}`, async () => {
          const res = await fetch(`${origin}${path}`, { method, cache: "no-store", signal: AbortSignal.timeout(5000) });
          const ok = expected.includes(res.status);
          return { ok, warn: !ok, msg: `HTTP ${res.status}${ok ? " ✓" : ` — esperado ${expected.join(" o ")}`}` };
        }));
      }

      // Cron endpoint — if CRON_SECRET not set, endpoint may not enforce auth
      send(await test("api_cron_auth", "API", "API · GET /api/cron/browser-ingest", async () => {
        const hasCronSecret = !!process.env.CRON_SECRET;
        const res = await fetch(`${origin}/api/cron/browser-ingest`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!hasCronSecret) {
          return {
            ok: false,
            warn: true,
            msg: `HTTP ${res.status} — CRON_SECRET no configurado, endpoint sin protección`,
          };
        }
        return {
          ok: res.status === 401,
          warn: res.status !== 401,
          msg: `HTTP ${res.status}${res.status === 401 ? " — auth protegido ✓" : " — esperado 401"}`,
        };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  STORAGE                                             ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("rate_limit_behavior", "SEGURIDAD", "Seg · Rate limiter comportamiento real", async () => {
        if (!svc) return { ok: false, msg: "Service role key missing" };
        if (!tenantId) return { ok: false, warn: true, msg: "No tenant_id — saltar test" };
        const testKey = `diag-probe-${Date.now()}`;
        const testTenant = tenantId; // must be a valid tenant FK
        // Insert a bucket con 1 token
        const { error: insErr } = await svc.from("rate_limit_buckets").upsert({
          tenant_id: testTenant,
          key: testKey,
          tokens: 1,
          refilled_at: new Date().toISOString(),
        });
        if (insErr) return { ok: false, msg: `Insert failed: ${insErr.message}` };
        // Consume el token (tokens → 0)
        const { error: updErr } = await svc.from("rate_limit_buckets")
          .update({ tokens: 0 })
          .eq("tenant_id", testTenant)
          .eq("key", testKey);
        if (updErr) return { ok: false, msg: `Consume failed: ${updErr.message}` };
        // Verificar que quedó en 0
        const { data, error: selErr } = await svc.from("rate_limit_buckets")
          .select("tokens").eq("tenant_id", testTenant).eq("key", testKey).single();
        // Cleanup
        await svc.from("rate_limit_buckets").delete().eq("tenant_id", testTenant).eq("key", testKey);
        if (selErr || data?.tokens !== 0) return { ok: false, msg: "Token count incorrecto después de consumo" };
        return { ok: true, msg: "Insert → consume → verify → cleanup OK ✓" };
      }));

      send(await test("storage_write", "STORAGE", "Storage · Write + cleanup en 'documents'", async () => {
        if (!svc) return { ok: false, msg: "Service role key missing" };
        // Use application/pdf — the bucket allows PDF uploads
        const probe = new Uint8Array([37, 80, 68, 70, 10]); // minimal %PDF\n
        const path = `diag/probe-${Date.now()}.pdf`;
        const { error: upErr } = await svc.storage.from("documents").upload(path, probe, {
          upsert: true,
          contentType: "application/pdf",
        });
        if (upErr) return { ok: false, msg: `Upload failed: ${upErr.message}` };
        const { error: rmErr } = await svc.storage.from("documents").remove([path]);
        return { ok: !rmErr, msg: rmErr ? `Cleanup failed: ${rmErr.message}` : "Write + cleanup OK ✓" };
      }));

      send(await test("storage_list", "STORAGE", "Storage · List bucket contents", async () => {
        const { data, error } = await supabase.storage.from("documents").list("", { limit: 1 });
        return { ok: !error, msg: error ? error.message : `Listable ✓ — ${data?.length ?? 0} item(s) en raíz` };
      }));

      // ╔══════════════════════════════════════════════════════╗
      // ║  CRON                                                ║
      // ╚══════════════════════════════════════════════════════╝
      send(await test("cron_secret", "CRON", "Cron · CRON_SECRET configurado", async () => ({
        ok: !!process.env.CRON_SECRET,
        msg: process.env.CRON_SECRET ? "Set ✓" : "MISSING — jobs no autenticarán",
        warn: !process.env.CRON_SECRET,
      })));

      send(await test("cron_last_run", "CRON", "Cron · Último browser-ingest run", async () => {
        const { data } = await supabase.from("browser_ingest_runs").select("started_at, state")
          .order("started_at", { ascending: false }).limit(1).single();
        if (!data) return { ok: true, warn: false, msg: "Sin runs registrados (normal si no hay conexiones)" };
        const age = Math.round((Date.now() - new Date(data.started_at ?? Date.now()).getTime()) / 3600000);
        return { ok: true, warn: age > 48, msg: `Último run hace ${age}h — state: ${data.state}` };
      }));

      send(await test("cron_browser_connections", "CRON", "Cron · Browser ingest connections activas", async () => {
        const { count } = await supabase.from("browser_ingest_connections").select("*", { count: "exact", head: true })
          .eq("schedule_enabled", true);
        return { ok: true, warn: false, msg: `${count ?? 0} conexión(es) con schedule activo` };
      }));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" },
  });
}
