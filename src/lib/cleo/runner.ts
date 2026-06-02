// Cleo WebEDI runner — logs in, downloads a single PO as PDF using the portal's
// "Export as PDF" action, uploads to Storage and creates a `documents` row.
// The trigger comes from the email-ingest pipeline when a Cleo notification
// is received (sender alerts@datatrans-inc.com / forwarded). One job =
// one cleo_message_id.
//
// Credentials live in env vars (CLEO_USERNAME, CLEO_PASSWORD). Idempotency
// is enforced via the cleo_orders table (unique on tenant_id + cleo_message_id).

import chromium from "@sparticuz/chromium";
import { createServiceClient } from "@/lib/supabase/service";
import { chromium as playwrightChromium, type Browser, type Page } from "playwright-core";
import { createHash, randomUUID } from "crypto";
import { parseCleoHtml } from "@/lib/cleo/parse-html";
import { applyParsedToDraft } from "@/lib/cleo/apply-parsed";
import { getBrowserMode } from "@/lib/browser-mode";

export type CleoRLog = (level: "info" | "ok" | "warn" | "error", msg: string) => void;
export const cleoRLog0: CleoRLog = () => {};

// cleo_orders is created in migration 20260507000007 — types regen happens
// post-deploy. Use a permissive client surface for that table only.
type AnyTableClient = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => {
      select: (columns?: string) => {
        single: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

const DOCUMENT_BUCKET = "documents";
const NAV_TIMEOUT = 30_000;

export type CleoJob = {
  tenant_id: string;
  inbound_email_id: string | null; // null para dispatch manual (sin email origen)
  cleo_message_id: string;
  cleo_reference: string;
  cleo_batch_id: string;
  trading_partner: string | null;
  subject: string | null;
  from_email: string;
};

export type CleoResult =
  | { ok: true; document_id: string; cleo_order_id: string; size_bytes: number }
  | { ok: false; reason: string; cleo_order_id: string | null };

export async function launchBrowser(): Promise<Browser> {
  // Browser remoto dedicado (Browserless en el VPS). Solución de raíz al
  // problema de Chromium en serverless: un Chrome estable, multi-process y con
  // recursos dedicados elimina los crashes de --single-process / OOM y los
  // races de timing (botón deshabilitado, sesión inválida). Si la env var no
  // está, cae al Chromium empaquetado (comportamiento previo).
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  if (wsEndpoint) {
    return playwrightChromium.connect(wsEndpoint, { timeout: 60_000 });
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) {
    return playwrightChromium.launch({ executablePath, headless: true });
  }
  if (!process.env.VERCEL) {
    try {
      return await playwrightChromium.launch({ headless: true });
    } catch {
      // fall through to packaged
    }
  }
  // Merge sparticuz args with extra flags critical for Vercel's container:
  // --disable-dev-shm-usage: avoids /dev/shm exhaustion (default 64MB in containers)
  // --single-process: reduces memory footprint at cost of stability isolation
  const extraArgs = [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-setuid-sandbox",
  ];
  const mergedArgs = [...new Set([...chromium.args, ...extraArgs])];
  return playwrightChromium.launch({
    args: mergedArgs,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

// Detecta páginas de error de Chromium. Bajo --single-process (default de
// @sparticuz/chromium en Vercel), un crash del renderer al cargar un SPA pesado
// deja la pestaña en "chrome-error://chromewebdata/" con el body vacío. Volver
// a navegar suele recrear el renderer y resolver el problema.
function isChromeErrorPage(url: string): boolean {
  return (
    url.startsWith("chrome-error://") ||
    url.startsWith("data:text/html") ||
    url === "about:blank" ||
    url === ""
  );
}

// Navega con reintentos ante crash de renderer. Si page.goto deja la pestaña en
// chrome-error://, reintenta con backoff incremental antes de rendirse.
async function gotoCleoWithRetry(
  page: Page,
  url: string,
  attempts = 3,
): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      if (!isChromeErrorPage(page.url())) return;
      lastErr = new Error(`chrome_error_page:${page.url()}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) {
      await page.waitForTimeout(1000 * i); // 1s, 2s, …
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`cleo_navigate_failed:url=${url}|reason=${detail.slice(0, 120)}`);
}

export async function loginCleo(page: Page) {
  const username = process.env.CLEO_USERNAME;
  const password = process.env.CLEO_PASSWORD;
  if (!username || !password) throw new Error("cleo_credentials_missing");

  await gotoCleoWithRetry(page, "https://webedi.cleo.com/webedi/");

  if (page.url().includes("/login")) {
    await page.waitForSelector("#username", { state: "visible", timeout: NAV_TIMEOUT });

    // Dar tiempo suficiente a Vue para enlazar todos los v-model.
    // 800ms era muy poco en servidores lentos — con 1500ms siempre está listo.
    await page.waitForTimeout(1500);

    // Función interna para llenar un campo y verificar que quedó completo.
    // pressSequentially dispara keydown/input/keyup — necesario para Vue v-model.
    // Tab solo se usa en username (activa blur → validación + mueve foco a password).
    // NO usar Tab en password: puede enviar el form prematuramente o limpiar el campo.
    const fillField = async (selector: string, value: string, tabAfter = false) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.locator(selector).click({ clickCount: 3 });
        await page.waitForTimeout(150);
        await page.locator(selector).pressSequentially(value, { delay: 60 });
        if (tabAfter) {
          await page.locator(selector).press("Tab");
          await page.waitForTimeout(300);
        } else {
          // blur explícito sin mover foco — dispara validación Vue sin efecto secundario
          await page.locator(selector).evaluate((el) => el.dispatchEvent(new Event("blur", { bubbles: true })));
          await page.waitForTimeout(200);
        }

        const actual = await page.locator(selector).inputValue().catch(() => "");
        if (actual.length >= value.length) break;

        await page.locator(selector).fill("");
        await page.waitForTimeout(400 * attempt);
      }
    };

    // username → Tab para mover foco al password naturalmente
    await fillField("#username", username, true);
    // password → blur por evento, NO Tab (evita envío prematuro)
    await fillField("#password", password, false);

    // Esperar a que Vue habilite el botón (máx 8s).
    const btnEnabled = await page.waitForFunction(
      () => {
        const btn = document.querySelector("#btnlogin") as HTMLButtonElement | null;
        const u = document.querySelector("#username") as HTMLInputElement | null;
        const p = document.querySelector("#password") as HTMLInputElement | null;
        return Boolean(btn && !btn.disabled && u?.value && p?.value);
      },
      { timeout: 8000 },
    ).then(() => true).catch(() => false);

    if (btnEnabled) {
      await page.click("#btnlogin");
    } else {
      // Botón sigue disabled — Enter en password como bypass
      await page.locator("#password").press("Enter");
      await page.waitForTimeout(800);
      if (page.url().includes("/login")) {
        await page.click("#btnlogin", { force: true }).catch(() => {});
      }
    }

    // Segunda pasada: si Vue swallows el primer submit, reintentar.
    await page.waitForTimeout(1200);
    if (page.url().includes("/login")) {
      // Re-verificar que los campos siguen con valores antes del 2do intento
      const stillFilled = await page.evaluate(() => {
        const u = document.querySelector("#username") as HTMLInputElement | null;
        const p = document.querySelector("#password") as HTMLInputElement | null;
        return Boolean(u?.value && p?.value);
      });
      if (stillFilled) {
        await page.click("#btnlogin", { force: true }).catch(() => {});
      } else {
        // Campos vacíos = form fue limpiado post-submit. Cleo puede estar
        // procesando el login (lento). Dar más tiempo antes de fallar.
        await page.waitForTimeout(5000);
      }
    }

    // Esperar a que el namespace WEBEDI aparezca — es más confiable que
    // verificar el URL, que puede pasar por rutas intermedias con "/login".
    // Timeout 60s para auth lenta de Cleo.
    try {
      await page.waitForFunction(
        () => Boolean((window as unknown as Record<string, unknown>).WEBEDI),
        { timeout: 60_000 },
      );
    } catch {
      let snapshot = "no snapshot";
      try {
        const buf = await page.screenshot({ fullPage: false });
        snapshot = `screenshot=${buf.length}b`;
      } catch { /* ignore */ }
      const errText = await page
        .locator(".alert-danger, .login-error, [class*='error']")
        .first()
        .textContent({ timeout: 1500 })
        .catch(() => null);
      const inputs = await page.evaluate(() => {
        const u = document.querySelector("#username") as HTMLInputElement | null;
        const p = document.querySelector("#password") as HTMLInputElement | null;
        const btn = document.querySelector("#btnlogin") as HTMLButtonElement | null;
        return {
          uVal: u?.value?.length ?? -1,
          pVal: p?.value?.length ?? -1,
          btnDisabled: btn?.disabled ?? null,
          bodyText: document.body.innerText.slice(0, 400),
          url: window.location.href,
        };
      });
      throw new Error(
        `cleo_login_failed:err=${(errText ?? "none").trim().slice(0, 80)}|state=${JSON.stringify(inputs)}|${snapshot}|url=${page.url()}`,
      );
    }
  }

  // Wait for the SPA shell + WEBEDI namespace to fully initialize. Calling
  // printDocument before this can race with session bootstrapping and produce
  // "Your session is invalid".
  //
  // Antes esperábamos también `WEBEDI.mailbox.inboxdatatable`, pero ese es
  // el datatable del inbox que ya no usamos (vamos directo al doc por ID
  // vía printDocument). Algunas cuentas con muchos records lo demoraban en
  // montarse y nos hacía caer en timeout 30s aunque el SPA estuviese listo
  // para procesar la orden. Bastarnos con `WEBEDI.doc`.
  try {
    await page.waitForFunction(
      () => {
        const w = window as unknown as { WEBEDI?: { doc?: unknown } };
        return Boolean(w.WEBEDI?.doc);
      },
      { timeout: NAV_TIMEOUT },
    );
  } catch (err) {
    // Diagnóstico granular antes de re-throw: qué piezas del SPA montaron y
    // cuáles no. Sin esto el mensaje genérico "Timeout 30000ms" no permite
    // distinguir si Cleo está down, lento, o si el flujo cambió.
    const state = await page
      .evaluate(() => {
        const w = window as unknown as {
          WEBEDI?: { doc?: unknown; mailbox?: { inboxdatatable?: unknown } };
        };
        return {
          hasWebedi: Boolean(w.WEBEDI),
          hasDoc: Boolean(w.WEBEDI?.doc),
          hasInbox: Boolean(w.WEBEDI?.mailbox?.inboxdatatable),
          url: window.location.href,
          readyState: document.readyState,
        };
      })
      .catch(() => null);
    const stateStr = state ? JSON.stringify(state) : "no_state";
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`cleo_spa_bootstrap_timeout:${message}|state=${stateStr}`);
  }

  // Small idle wait — lets pendo and other SPA bootstrap chatter settle so
  // the next XHR uses a fully-attached session.
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});
}

async function downloadPoAsPdf(
  page: Page,
  messageId: string,
): Promise<{ pdf: Buffer; html: string }> {
  // Cleo's WEBEDI.doc.printDocument(id) returns the FULL HTML of the PO ready
  // to print (NOT a URL). It uses the active session for context. We capture
  // the HTML, then render it to PDF using Playwright's page.pdf().
  const apiResponse = await page.evaluate(async (id) => {
    function safeStringify(v: unknown): string {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    const w = window as unknown as { WEBEDI?: { doc?: { printDocument?: (n: number) => unknown } } };
    if (!w.WEBEDI?.doc?.printDocument) {
      return { ok: false, error: "WEBEDI.doc.printDocument missing" };
    }
    try {
      const out = await w.WEBEDI.doc.printDocument(Number(id));
      return { ok: true, value: out };
    } catch (err) {
      const detail =
        err instanceof Error ? `${err.name}: ${err.message}` : safeStringify(err);
      return { ok: false, error: detail };
    }
  }, messageId);

  if (!apiResponse.ok) {
    throw new Error(`cleo_print_api_failed:${apiResponse.error}`);
  }

  // Normalize: the print API may return either a raw HTML string or an
  // object whose `message`/`html`/`result.message` field contains the HTML.
  const value = apiResponse.value;
  let html: string | null = null;
  if (typeof value === "string") {
    html = value;
  } else if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const result = v.result as Record<string, unknown> | undefined;
    html =
      (typeof v.html === "string" ? (v.html as string) : null) ??
      (typeof v.message === "string" ? (v.message as string) : null) ??
      (result && typeof result.message === "string" ? (result.message as string) : null) ??
      (result && typeof result.html === "string" ? (result.html as string) : null);
  }

  if (!html || html.length < 100) {
    throw new Error(
      `cleo_print_html_missing:got=${JSON.stringify(value).slice(0, 200)}`,
    );
  }

  // Render the PO HTML to PDF in a fresh page. Same browser context = cookies
  // heredados para que las CSS de webedi.cleo.com carguen autenticadas.
  const printPage = await page.context().newPage();
  try {
    // Siempre inyectar <base href> para que URLs relativas de CSS/imágenes
    // resuelvan correctamente, incluso cuando el HTML ya tiene <html>.
    let fullHtml: string;
    if (html.includes("<html")) {
      fullHtml = /<base\s/i.test(html)
        ? html
        : html.replace(/(<head[^>]*>)/i, '<base href="https://webedi.cleo.com/">');
    } else {
      fullHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="https://webedi.cleo.com/"></head><body>${html}</body></html>`;
    }

    // emulateMedia('print') activa los @media print de Cleo (tablas, colores,
    // bordes) que no se aplican en modo 'screen'. Es la causa principal de que
    // el PDF salga sin estilo.
    await printPage.emulateMedia({ media: "print" });
    await printPage.setViewportSize({ width: 1056, height: 800 }); // 11in @ 96dpi
    await printPage.setContent(fullHtml, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
    // Espera adicional para que fuentes y CSS diferidos terminen de cargar.
    await printPage.waitForTimeout(1500);

    const contentHeightPx = await printPage.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    // 96 DPI Chromium default. +0.5in slack para que nada se corte.
    const heightInches = Math.min(48, Math.max(11, contentHeightPx / 96 + 0.5));
    const pdf = await printPage.pdf({
      width: "11in",
      height: `${heightInches}in`,
      printBackground: true,
      margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" },
    });
    if (!pdf || pdf.length < 4 || pdf.subarray(0, 4).toString() !== "%PDF") {
      throw new Error("cleo_pdf_render_invalid");
    }
    return { pdf: Buffer.from(pdf), html };
  } finally {
    await printPage.close().catch(() => {});
  }
}

async function sha256Hex(bytes: Buffer): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runCleoJob(job: CleoJob, log: CleoRLog = cleoRLog0): Promise<CleoResult> {
  const supabase = createServiceClient();
  const cleo = supabase as unknown as AnyTableClient;

  // 1. Pre-check: evitar que el upsert con state:"running" sobreescriba
  // una fila ya "downloaded" antes de poder detectar idempotencia.
  const { data: preCheck } = await supabase
    .from("cleo_orders" as "documents")
    .select("id, state, document_id, attempts")
    .eq("tenant_id", job.tenant_id)
    .eq("cleo_message_id" as "id", job.cleo_message_id)
    .maybeSingle();
  const pre = preCheck as { id: string; state: string; document_id: string | null; attempts: number } | null;
  if (pre?.state === "downloaded" && pre.document_id) {
    return { ok: true, document_id: pre.document_id, cleo_order_id: pre.id, size_bytes: 0 };
  }

  // 2. Upsert cleo_orders row (idempotent on tenant + message_id)
  const { data: orderRow, error: orderError } = await cleo
    .from("cleo_orders")
    .upsert(
      {
        tenant_id: job.tenant_id,
        cleo_message_id: job.cleo_message_id,
        cleo_reference: job.cleo_reference,
        cleo_batch_id: job.cleo_batch_id,
        trading_partner: job.trading_partner,
        inbound_email_id: job.inbound_email_id,
        state: "running",
      },
      { onConflict: "tenant_id,cleo_message_id" },
    )
    .select("id, state, document_id, attempts")
    .single();

  if (orderError || !orderRow) {
    return { ok: false, reason: orderError?.message ?? "cleo_order_upsert_failed", cleo_order_id: null };
  }

  const existing = orderRow as { id: string; state: string; document_id: string | null; attempts: number };
  if (existing.state === "downloaded" && existing.document_id) {
    return { ok: true, document_id: existing.document_id, cleo_order_id: existing.id, size_bytes: 0 };
  }

  let browser: Browser | null = null;
  try {
    await cleo
      .from("cleo_orders")
      .update({ attempts: existing.attempts + 1, last_error: null })
      .eq("id", existing.id);

    const bmode = getBrowserMode();
    log(
      "info",
      bmode.remote
        ? `Conectándose al navegador del VPS (${bmode.host ?? "remoto"})...`
        : "Browser iniciando...",
    );
    browser = await launchBrowser();
    log("ok", bmode.remote ? `Conectado al navegador del VPS (${bmode.host ?? "remoto"})` : "Browser listo");
    log("info", `Procesando order ${job.cleo_message_id}...`);
    // Stealth: a default Playwright context exposes navigator.webdriver=true
    // and other bot signals that Cleo's auth layer rejects ("Bad
    // username/password" even with valid creds). We mimic a real Chrome.
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
      // Override navigator.webdriver = false (default is true under
      // Playwright). Cleo's portal checks this and rejects login.
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // Make navigator.plugins / languages look real.
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });
    const page = await context.newPage();

    log("info", "Iniciando sesión en Cleo WebEDI...");
    await loginCleo(page);
    log("ok", "Login exitoso");
    log("info", "Navegando al documento...");
    const { pdf, html } = await downloadPoAsPdf(page, job.cleo_message_id);

    log("ok", `PDF capturado (${Math.round(pdf.length / 1024)} KB)`);
    if (!pdf || pdf.length === 0) throw new Error("cleo_pdf_empty");
    if (pdf.length > 25 * 1024 * 1024) throw new Error("cleo_pdf_too_large");

    // Parse the Cleo HTML for authoritative structured data (line items,
    // addresses, totals). Fall back gracefully if parsing fails — the PDF
    // still goes to AI extraction as a safety net.
    let parsed: ReturnType<typeof parseCleoHtml> | null = null;
    try {
      parsed = parseCleoHtml(html);
    } catch (err) {
      console.warn("cleo_html_parse_warning:", err);
    }

    // 2. Upload PDF + raw HTML to Storage
    const documentId = randomUUID();
    const ts = new Date().toISOString().slice(0, 7);
    const storagePath = `${job.tenant_id}/cleo/${ts}/${documentId}.pdf`;
    const htmlStoragePath = `${job.tenant_id}/cleo/${ts}/${documentId}.html`;
    log("info", "Subiendo a storage...");
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`cleo_storage_upload_failed:${uploadError.message}`);
    // HTML upload is best-effort — don't fail the run if it errors.
    await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(htmlStoragePath, html, { contentType: "text/html", upsert: false })
      .catch((err) => console.warn("cleo_html_upload_warning:", err));

    // 3. Resolve provider_id. Two-stage lookup:
    //   Stage 1: exact (case-insensitive) match on job.trading_partner.
    //            Works for orders that came via email (trading_partner is set).
    //   Stage 2: keyword match on parsed.buying_party.company_name for
    //            manual/portal-scanner dispatches where trading_partner is null.
    //            Uses significant words (len > 3, not common stop-words) so
    //            "SAMS CLUB 4727" → keyword "sams" → "Walmart / Sams Club".
    let providerId: string | null = null;

    // Matcher robusto: normaliza ambos lados (trading_partner del partner vs
    // name/aliases del provider) y compara. Cubre los casos donde el partner
    // escribe "Northern Tool & Equipment" pero en la DB está "NORTHERN TOOL +
    // EQUIPMENT" (& vs +), o "AT&T" vs "ATT", o variantes con espacios/guiones.
    type ProviderCandidate = { id: string; name: string; settings: Record<string, unknown> | null };
    type DynProvidersFetch = {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: ProviderCandidate[] | null; error: unknown }>;
      };
    };
    const providerFetcher = supabase.from("providers") as unknown as DynProvidersFetch;
    const { data: allProviders } = await providerFetcher
      .select("id, name, settings")
      .eq("tenant_id", job.tenant_id);

    function normalizeName(s: string | null | undefined): string {
      if (!s) return "";
      return s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")           // diacritics
        .replace(/[&+./\-_,'"`()]+/g, " ")          // punctuation → space
        .replace(/\s+/g, " ")                       // collapse spaces
        .trim();
    }

    function providerCandidates(p: ProviderCandidate): string[] {
      const out = [p.name];
      const aliases = (p.settings ?? {})["aliases"];
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          if (typeof a === "string" && a.trim()) out.push(a);
        }
      }
      return out;
    }

    function findProvider(needle: string, mode: "exact" | "contains"): string | null {
      const target = normalizeName(needle);
      if (!target) return null;
      for (const p of allProviders ?? []) {
        for (const cand of providerCandidates(p)) {
          const candNorm = normalizeName(cand);
          if (!candNorm) continue;
          if (mode === "exact" && candNorm === target) return p.id;
          if (mode === "contains" && candNorm.includes(target)) return p.id;
        }
      }
      return null;
    }

    // Stage 1: exact normalized match on trading_partner against provider
    // name and aliases.
    if (job.trading_partner) {
      providerId = findProvider(job.trading_partner, "exact");
    }

    // Stage 2: fallback — keyword match on parsed buying party name.
    if (!providerId && parsed?.buying_party.company_name) {
      const STOP = new Set([
        "accounts", "payable", "corp", "corporation", "inc", "llc", "ltd",
        "the", "and", "co", "company", "group",
      ]);
      const keywords = normalizeName(parsed.buying_party.company_name)
        .split(" ")
        .filter((w) => w.length >= 3 && !STOP.has(w) && /^[a-z]/.test(w));
      for (const kw of keywords) {
        const id = findProvider(kw, "contains");
        if (id) { providerId = id; break; }
      }
    }

    // 4. Create documents row
    const checksum = await sha256Hex(pdf);
    const partnerSlug = (job.trading_partner ?? "cleo").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    const originalName = `${partnerSlug}-${job.cleo_reference || job.cleo_message_id}.pdf`;
    const documentInsert = {
      id: documentId,
      tenant_id: job.tenant_id,
      provider_id: providerId,
      original_name: originalName,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: pdf.length,
      state: "uploaded",
      source_channel: "browser",
      source_ref: existing.id,
      source_meta: {
        source: "cleo",
        cleo_message_id: job.cleo_message_id,
        cleo_reference: job.cleo_reference,
        cleo_batch_id: job.cleo_batch_id,
        trading_partner: job.trading_partner,
        inbound_email_id: job.inbound_email_id,
        checksum,
        provider_match_method: providerId ? "trading_partner_name" : null,
      },
      // uploaded_by is now nullable (migration 20260507000006). DB default
      // works but TS types weren't regenerated yet — bypass via cast.
    };
    const { data: docRow, error: docError } = await (
      supabase.from("documents") as unknown as {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { message?: string } | null }>;
          };
        };
      }
    )
      .insert(documentInsert)
      .select("id")
      .single();
    if (docError || !docRow) throw new Error(`cleo_document_insert_failed:${docError?.message ?? "unknown"}`);

    // Archive any prior documents for the same cleo_message_id so the
    // inbox shows only the latest run. Idempotency on cleo_orders prevents
    // double-creates, but on retry we still want stale earlier rows hidden.
    await (
      supabase.from("documents") as unknown as {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              neq: (c: string, v: string) => Promise<{ error: unknown }>;
            };
          };
        };
      }
    )
      .update({ state: "archived" })
      .eq("tenant_id", job.tenant_id)
      .eq("source_meta->>cleo_message_id", job.cleo_message_id)
      .neq("id", documentId);

    // 4. Mark cleo_order downloaded + persist parsed payload + html path
    await cleo
      .from("cleo_orders")
      .update({
        state: "downloaded",
        document_id: documentId,
        parsed_payload: parsed,
        html_storage_path: htmlStoragePath,
      })
      .eq("id", existing.id);

    // 5. Trigger AI ingest pipeline (best-effort)
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ document_id: documentId, tenant_id: job.tenant_id }),
    }).catch(() => {});

    // 6. Apply parsed payload to order_draft + lines. We do this AFTER the
    // ingest invoke (which creates the order_draft) but the ingest function
    // runs async — so the draft might not exist yet. The applyParsedToDraft
    // helper checks for the draft and returns gracefully if not found yet.
    // The post-ai-process flow (or a manual "Re-apply Cleo data" button)
    // can re-run this once the draft exists.
    if (parsed && parsed.lines.length > 0) {
      try {
        const apply = await applyParsedToDraft(documentId, job.tenant_id, providerId, parsed);
        if (apply.draft_id) {
          console.log(
            `cleo apply OK: draft=${apply.draft_id} lines=${apply.lines_inserted} unmatched=${apply.unmatched_skus.join(",")}`,
          );
        }
      } catch (err) {
        console.warn("cleo_apply_warning:", err);
      }
    }

    log("ok", `✓ Orden descargada — doc ${documentId}`);
    return { ok: true, document_id: documentId, cleo_order_id: existing.id, size_bytes: pdf.length };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log("error", reason);
    // Guard de raíz: no degradar una orden ya completada. Si un paso posterior
    // a marcar "downloaded" (trigger de ingest, apply de parsed, cierre del
    // browser) lanza, el éxito ya persistido no debe revertirse a "failed".
    const { data: completed } = await supabase
      .from("cleo_orders" as "documents")
      .select("state, document_id")
      .eq("id", existing.id)
      .maybeSingle();
    const done = completed as { state: string; document_id: string | null } | null;
    if (done?.state === "downloaded" && done.document_id) {
      log("ok", `Error posterior a la descarga ignorado (orden ya completada): ${reason}`);
      return { ok: true, document_id: done.document_id, cleo_order_id: existing.id, size_bytes: 0 };
    }
    await cleo
      .from("cleo_orders")
      .update({ state: "failed", last_error: reason })
      .eq("id", existing.id);
    return { ok: false, reason, cleo_order_id: existing.id };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
