// Lógica compartida del portal scanner: lanzar browser, hacer login,
// leer inbox, filtrar 850s nuevas y despachar runCleoJob por cada una.
// Importado por el cron (route.ts) y el SSE endpoint (portal-scan-stream).

import { createServiceClient } from "@/lib/supabase/service";
import { launchBrowser, loginCleo, runCleoJob, cleoRLog0, type CleoRLog } from "./runner";
import { readCleoInbox } from "./portal-scanner";
import type { Browser } from "playwright-core";

export type PortalScanResult = {
  ok: boolean;
  found: number;
  dispatched: number;
  skipped: number;
  errors: string[];
};

type AnyClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown; error: unknown }>;
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

export async function runCleoPortalScan(
  tenantId: string,
  log: CleoRLog = cleoRLog0,
): Promise<PortalScanResult> {
  const svc = createServiceClient();
  const db = svc as unknown as AnyClient;

  // 1. Leer cleo_orders ya descargadas/en proceso para evitar duplicados
  log("info", "Consultando órdenes Cleo ya registradas...");
  const { data: existingRows } = await db
    .from("cleo_orders")
    .select("cleo_message_id")
    .eq("tenant_id", tenantId);

  const downloadedSet = new Set<string>(
    (Array.isArray(existingRows) ? existingRows : []).map(
      (r: Record<string, unknown>) => String(r.cleo_message_id ?? ""),
    ),
  );
  log("info", `${downloadedSet.size} órdenes ya registradas`);

  // 2. Browser → login → inbox
  let browser: Browser | null = null;
  const result: PortalScanResult = {
    ok: false,
    found: 0,
    dispatched: 0,
    skipped: 0,
    errors: [],
  };

  try {
    log("info", "Lanzando browser...");
    browser = await launchBrowser();
    log("ok", "Browser listo");

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/Mexico_City",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    });
    const page = await context.newPage();

    log("info", "Iniciando sesión en Cleo WebEDI...");
    await loginCleo(page);
    log("ok", "Login exitoso");

    const inbox = await readCleoInbox(page, log);
    const orders850 = inbox.filter((item) => item.document === "850");
    result.found = orders850.length;

    // 3. Filtrar las que ya están en el sistema
    const newOrders = orders850.filter((item) => !downloadedSet.has(item.messageId));
    const skippedCount = orders850.length - newOrders.length;
    result.skipped = skippedCount;

    if (skippedCount > 0) {
      log("info", `${skippedCount} orden(es) 850 ya registradas — omitidas`);
    }
    if (newOrders.length === 0) {
      log("ok", "No hay órdenes 850 nuevas en el portal");
      result.ok = true;
      return result;
    }

    log("info", `${newOrders.length} orden(es) 850 nuevas — despachando...`);

    // 4. Despachar runCleoJob por cada una
    for (const item of newOrders) {
      log("info", `→ messageId ${item.messageId} ref=${item.reference || "(sin ref)"}`);
      try {
        const jobResult = await runCleoJob(
          {
            tenant_id: tenantId,
            inbound_email_id: null,
            cleo_message_id: item.messageId,
            cleo_reference: item.reference,
            cleo_batch_id: item.batchId,
            trading_partner: null,
            subject: null,
            from_email: "portal@cleo.com",
          },
          log,
        );
        if (jobResult.ok) {
          result.dispatched += 1;
        } else {
          result.errors.push(`${item.messageId}: ${jobResult.reason}`);
          log("error", `Error en ${item.messageId}: ${jobResult.reason}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${item.messageId}: ${msg}`);
        log("error", `Excepción en ${item.messageId}: ${msg}`);
      }
    }

    result.ok = true;
    log(
      "ok",
      `✓ Scan portal completado — ${result.dispatched} despachadas, ${result.skipped} omitidas, ${result.errors.length} errores`,
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // 5. Registrar en cleo_smoke_runs
  try {
    await db.from("cleo_smoke_runs").insert({
      tenant_id: tenantId,
      ok: result.ok,
      checks: [
        {
          name: "portal_inbox_scan",
          ok: result.ok,
          detail: `found=${result.found} dispatched=${result.dispatched} skipped=${result.skipped} errors=${result.errors.length}`,
        },
      ],
    });
  } catch {
    // log de smoke es best-effort
  }

  return result;
}
