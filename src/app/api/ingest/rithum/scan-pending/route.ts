// Rithum dashboard scanner — backstop cron that runs every 15 min.
// Logs in to dsm.commercehub.com, reads every partner's "Open / No Activity"
// bucket, extracts PO numbers, and dispatches a job for each one that isn't
// already downloaded. Covers the case where the email trigger failed,
// was delayed, or Rithum sent more than 10 orders (their email cap).
//
// Auth: Vercel Cron (CRON_SECRET bearer) or tenant session (dashboard button).

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";
import { type Browser, type Page } from "playwright-core";
import {
  launchBrowser,
  createRithumContext,
  loginRithum,
  setSelectByLabel,
  RithumLoginError,
  type RithumLoginDiagnostics,
  RITHUM_BASE_URL,
  NAV_TIMEOUT,
  type RLog,
  rLog0,
} from "@/lib/rithum/browser";


export const runtime = "nodejs";
export const maxDuration = 300;

// Walmart Marketplace deshabilitado — precios vacíos en las líneas (problema
// interno de ellos). Se conectará via plugin separado a Walmart Seller Central.
const PARTNERS: Array<{ pid: string; name: string }> = [
  { pid: "thehomedepot", name: "The Home Depot Inc" },
];

// Extrae PO Numbers anclando en los links de orden (href con Hub_PO= u orderid=).
// Para cada link encontrado busca el número en:
//   1. Texto del propio link (si es número de 6+ dígitos)
//   2. Celda <td> exactamente igual a un número de 6+ dígitos en la misma fila
//   3. Número de 6+ dígitos embebido en el texto de cualquier celda de la fila
// Robusto ante cambios de markup donde el PO aparece en columna separada al link.
function extractPoNumbersFromPage(page: Page): Promise<Array<{ poNumber: string }>> {
  return page.evaluate(() => {
    const out: Array<{ poNumber: string }> = [];
    const seen = new Set<string>();
    const isPo = (s: string) => /^\d{6,}$/.test(s);

    const orderLinks = Array.from(
      document.querySelectorAll('a[href*="Hub_PO="], a[href*="orderid="]'),
    ) as HTMLAnchorElement[];

    for (const a of orderLinks) {
      // 1) El texto del link ES el PO.
      const linkText = (a.textContent ?? "").trim();
      if (isPo(linkText) && !seen.has(linkText)) {
        out.push({ poNumber: linkText });
        seen.add(linkText);
        continue;
      }

      // 2) Buscar en la fila el PO como número suelto o embebido en texto.
      const row = a.closest("tr");
      if (!row) continue;
      let found = false;
      for (const cell of Array.from(row.querySelectorAll("td, th"))) {
        const text = (cell.textContent ?? "").trim();
        if (isPo(text) && !seen.has(text)) {
          out.push({ poNumber: text });
          seen.add(text);
          found = true;
          break;
        }
        const m = text.match(/\b(\d{6,})\b/);
        if (m && !seen.has(m[1])) {
          out.push({ poNumber: m[1] });
          seen.add(m[1]);
          found = true;
          break;
        }
      }
      if (found) continue;
    }

    return out;
  });
}

// Busca órdenes abiertas vía el buscador genérico del portal:
//   1) navegar a gotoGenericSearchResults.do
//   2) click "Expand" si el formulario está colapsado
//   3) Status = Open
//   4) click "Go"
//   5) extraer PO numbers de la página de resultados
async function scanOpenOrdersViaForm(page: Page, log: RLog = rLog0): Promise<Array<{ poNumber: string }>> {
  log("info", "Abriendo buscador de órdenes...");
  await page.goto(`${RITHUM_BASE_URL}/dsm/gotoGenericSearchResults.do`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  // ── 1. Expandir el formulario ──────────────────────────────────────────────
  log("info", "Expandiendo formulario de búsqueda...");
  const expandBtn = page
    .locator(
      'a:has-text("Expand"), button:has-text("Expand"), input[value="Expand"], input[type="button"][value="Expand"]',
    )
    .first();
  if (await expandBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await expandBtn.click({ timeout: 5_000 }).catch(() => {});
    await page
      .waitForFunction(
        () => {
          const els = Array.from(document.querySelectorAll("td, th, label, div, span"));
          return els.some((e) => {
            const t = (e.textContent ?? "").trim().toLowerCase().replace(/[:\s]+$/, "");
            return t === "status";
          });
        },
        { timeout: 5_000 },
      )
      .catch(() => {});
    log("ok", "Formulario expandido");
  }

  // ── 2. Status = Open (obligatorio) ─────────────────────────────────────────
  log("info", "Aplicando filtro Status = Open...");
  const statusOk = await setSelectByLabel(page, "Status", "Open");
  if (!statusOk) {
    throw new Error(`rithum_scan_status_field_not_found:url=${page.url()}`);
  }

  // ── 3. Click Go ────────────────────────────────────────────────────────────
  log("info", "Ejecutando búsqueda...");
  const goBtn = page
    .locator(
      'input[type="submit"][value="Go"], input[type="button"][value="Go"], button:has-text("Go"), a:has-text("Go")',
    )
    .filter({ visible: true })
    .first();
  await goBtn.click({ timeout: 10_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  // ── 4. Extraer PO numbers ──────────────────────────────────────────────────
  const results = await extractPoNumbersFromPage(page);
  log("ok", `Encontradas ${results.length} órdenes abiertas`);
  return results;
}

type ScanResult = {
  partner: string;
  found: number;
  dispatched: number;
  skipped: number;
  errors: string[];
  loginDiagnostics?: RithumLoginDiagnostics;
};

async function dispatchJob(
  tenantId: string,
  poNumber: string,
  partner: string,
  partnerPid: string,
): Promise<{ ok: boolean; reason: string }> {
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL;
  const token = process.env.INTAKE_RITHUM_INTERNAL_TOKEN;
  if (!baseUrl || !token) return { ok: false, reason: "not_configured" };
  try {
    const r = await fetch(`${baseUrl}/api/ingest/rithum/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rithum-internal-token": token,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        inbound_email_id: null, // scan-sourced — no email trigger
        rithum_order_number: poNumber,
        rithum_partner: partner,
        rithum_partner_pid: partnerPid,
        rithum_order_date: null,
        subject: "scan-pending",
        from_email: "cron@docflow",
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, reason: r.ok ? "dispatched" : `http_${r.status}` };
  } catch (err) {
    // Timeout is OK — the runner started and is processing async.
    return { ok: true, reason: err instanceof Error ? err.message : "fetch_error" };
  }
}

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  try {
    return await scanHandler(req);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack?.slice(0, 400)}` : String(err);
    console.error("scan-pending unhandled:", msg);
    return NextResponse.json({ error: "unhandled", detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await scanHandler(req);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack?.slice(0, 400)}` : String(err);
    console.error("scan-pending unhandled:", msg);
    return NextResponse.json({ error: "unhandled", detail: msg }, { status: 500 });
  }
}

// runScan es la lógica pura del scan, exportada para ser usada desde SSE (scan-stream).
export async function runScan(tenantId: string, log: RLog = rLog0): Promise<ScanResult> {
  log("info", "Iniciando scan del dashboard de Rithum...");

  // Saltar órdenes ya descargadas o en proceso activo.
  // "running" se incluye para evitar double-dispatch si el cron coincide con
  // un worker activo. "downloaded" para no re-procesar órdenes terminadas.
  const svc = createServiceClient();
  const { data: existingRows } = await svc
    .from("rithum_orders")
    .select("rithum_order_number, state")
    .eq("tenant_id", tenantId)
    .returns<Array<{ rithum_order_number: string; state: string }>>();

  const downloadedSet = new Set(
    (existingRows ?? [])
      .filter((r) => r.state === "downloaded" || r.state === "running")
      .map((r) => r.rithum_order_number),
  );

  const result: ScanResult = {
    partner: "all",
    found: 0,
    dispatched: 0,
    skipped: 0,
    errors: [],
  };
  let browser: Browser | null = null;

  try {
    if (!process.env.RITHUM_USERNAME || !process.env.RITHUM_PASSWORD) {
      throw new Error("rithum_credentials_missing");
    }

    browser = await launchBrowser();
    const context = await createRithumContext(browser);
    const page = await context.newPage();
    await loginRithum(page, log);

    const poList = await scanOpenOrdersViaForm(page, log);
    result.found = poList.length;

    for (const { poNumber } of poList) {
      const skip = downloadedSet.has(poNumber);
      log("info", `→ PO ${poNumber}: ${skip ? "ya descargada, skip" : "despachando..."}`);
      if (skip) {
        result.skipped += 1;
        continue;
      }
      // Usar Home Depot como partner por defecto — único partner activo.
      const partner = PARTNERS[0];
      const dispatch = await dispatchJob(tenantId, poNumber, partner.name, partner.pid);
      if (dispatch.ok) {
        result.dispatched += 1;
        downloadedSet.add(poNumber);
        log("ok", `✓ PO ${poNumber} encolada`);
      } else {
        result.errors.push(`${poNumber}:${dispatch.reason}`);
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    if (err instanceof RithumLoginError) {
      result.loginDiagnostics = err.diagnostics;
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  log(
    "ok",
    `Scan completado: ${result.found} encontradas, ${result.dispatched} despachadas, ${result.skipped} skips`,
  );
  return result;
}

async function scanHandler(req: NextRequest) {
  // Resolve tenant_id: cron bearer → first tenant; session → ctx.tenantId.
  let tenantId: string;
  let cronMode = false;

  if (isCronRequest(req)) {
    cronMode = true;
    // Use the typed service client — no DynamicSupabaseClient needed here.
    const svc = createServiceClient();
    const { data: rows, error } = await svc
      .from("tenants")
      .select("id")
      .limit(1)
      .returns<Array<{ id: string }>>();
    if (error || !rows?.[0]?.id) {
      return NextResponse.json({ error: "no_tenant" }, { status: 422 });
    }
    tenantId = rows[0].id;
  } else {
    const ctx = await getTenantContext();
    if ("error" in ctx) return ctx.error;
    tenantId = ctx.tenantId;
  }

  const result = await runScan(tenantId, rLog0);

  // Log to rithum_smoke_runs for cron visibility.
  if (cronMode) {
    const svc = createServiceClient();
    await svc.from("rithum_smoke_runs").insert({
      tenant_id: tenantId,
      ok: result.errors.length === 0,
      checks: [
        {
          name: "scan_open_orders",
          ok: result.errors.length === 0,
          detail: `found=${result.found} dispatched=${result.dispatched} skipped=${result.skipped}${
            result.errors.length > 0 ? ` err=${result.errors.join(",")}` : ""
          }`,
          ...(result.loginDiagnostics ? { diagnostics: result.loginDiagnostics } : {}),
        },
      ] as unknown as Json,
    });
  }

  return NextResponse.json(
    {
      ok: result.errors.length === 0,
      total_found: result.found,
      total_dispatched: result.dispatched,
      skipped: result.skipped,
      errors: result.errors,
    },
    { status: 200 },
  );
}
