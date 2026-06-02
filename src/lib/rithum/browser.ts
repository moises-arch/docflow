// Shared Playwright helpers for the Rithum integration. Used by both the
// runner (runner.ts) and the dashboard scanner (scan-pending route).
//
// Login flow: dsm.commercehub.com → Auth0 SSO (account.commercehub.com)
// Two-step Universal Login:
//   1. /u/login/identifier — email (input[name="username"])
//   2. /u/login/password   — password (input[name="password"])
// Each step has a "Continue" button (button[type="submit"]).

import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type RLog = (level: "info" | "ok" | "warn" | "error", msg: string) => void;
export const rLog0: RLog = () => {};

export const RITHUM_BASE_URL =
  process.env.RITHUM_BASE_URL ?? "https://dsm.commercehub.com";

export const NAV_TIMEOUT = 30_000;
const STEP_TIMEOUT = 20_000;

const AUTH0_HOST = /account\.commercehub\.com|auth\.commercehub\.com|\.auth0\.com/i;

async function launchBrowserOnce(): Promise<Browser> {
  // Browser remoto dedicado (Browserless en el VPS). Solución de raíz al
  // problema de Chromium en serverless: un Chrome estable, multi-process y con
  // recursos dedicados elimina los crashes de --single-process / OOM y los
  // races de timing. Si la env var no está, cae al Chromium empaquetado.
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
      // fall through to packaged chromium
    }
  }
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

// ETXTBSY = Chromium binary locked by a concurrent invocation decompressing it.
// Retry with backoff — the lock clears in <2 s in practice.
export async function launchBrowser(maxAttempts = 4): Promise<Browser> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await launchBrowserOnce();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ETXTBSY") || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

// Tipo permisivo para storageState — Playwright lo serializa/parsea
// internamente, sólo necesitamos pasarlo opaco entre Supabase Storage y
// browser.newContext().
export type RithumStorageState = Parameters<Browser["newContext"]>[0] extends infer T
  ? T extends { storageState?: infer S } ? S : never
  : never;

export async function createRithumContext(
  browser: Browser,
  storageState?: RithumStorageState,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Mexico_City",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });
  return context;
}


// Fill the first VISIBLE input matching any of the given selectors.
// Returns the matched selector or throws if none worked.
async function fillFirstVisible(
  page: Page,
  selectors: string[],
  value: string,
  fieldName: string,
): Promise<string> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).filter({ visible: true });
      const count = await loc.count();
      if (count > 0) {
        await loc.first().fill(value, { timeout: STEP_TIMEOUT });
        return sel;
      }
    } catch {
      // page may have navigated mid-redirect — skip to next selector
    }
  }
  // Last resort: any visible non-hidden input on the page
  try {
    const allInputs = page.locator("input:not([type='hidden']):not([type='submit']):not([type='checkbox'])").filter({ visible: true });
    const cnt = await allInputs.count();
    if (cnt > 0) {
      await allInputs.first().fill(value, { timeout: STEP_TIMEOUT });
      return "input[fallback]";
    }
  } catch { /* ignore */ }

  // Capture screenshot for diagnosis before throwing
  let screenshotSize = "no_screenshot";
  try {
    const buf = await page.screenshot({ fullPage: false });
    screenshotSize = `${buf.length}b`;
  } catch { /* ignore */ }
  // Log visible inputs count for debugging
  let inputCount = 0;
  try {
    inputCount = await page.locator("input").count();
  } catch { /* ignore */ }

  throw new Error(`rithum_login_${fieldName}_not_found:url=${page.url()}|inputs=${inputCount}|screenshot=${screenshotSize}`);
}

// Click first visible matching button.
async function clickFirstVisible(
  page: Page,
  selectors: string[],
  buttonName: string,
): Promise<void> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).filter({ visible: true });
      const count = await loc.count();
      if (count > 0) {
        await loc.first().click({ timeout: STEP_TIMEOUT });
        return;
      }
    } catch {
      // page may have navigated mid-redirect — skip to next selector
    }
  }
  throw new Error(`rithum_login_${buttonName}_not_found:url=${page.url()}`);
}

// Read the visible Auth0 error message if present.
async function readAuth0Error(page: Page): Promise<string | null> {
  const errSelectors = [
    '[role="alert"]',
    ".cf6606",
    ".error-message",
    ".ulp-error-info",
    ".alert-danger",
    "[class*='error']",
  ];
  for (const sel of errSelectors) {
    const txt = await page
      .locator(sel)
      .filter({ visible: true })
      .first()
      .textContent({ timeout: 800 })
      .catch(() => null);
    if (txt && txt.trim().length > 2) return txt.trim().slice(0, 120);
  }
  return null;
}

// Códigos canónicos de fallo de login — usar para categorizar y reaccionar.
// Cada uno tiene una respuesta operativa distinta:
//   invalid_credentials  → notificar admin, no reintentar
//   mfa_required         → notificar admin, configurar bypass o pasar a flow manual
//   captcha_challenge    → cambiar IP / usar Browserbase
//   cloudflare_challenge → cambiar IP / usar Browserbase
//   account_locked       → contactar Rithum, no reintentar
//   password_submit_failed → selector roto, alertar dev
//   redirect_loop        → posible cookie corrupta, limpiar y reintentar
//   dashboard_not_reached → login OK pero portal cambió, alertar dev
//   network_error        → reintentar
//   unknown              → revisar diagnostics jsonb manualmente
export type RithumLoginErrorCode =
  | "invalid_credentials"
  | "mfa_required"
  | "captcha_challenge"
  | "cloudflare_challenge"
  | "account_locked"
  | "password_submit_failed"
  | "redirect_loop"
  | "dashboard_not_reached"
  | "network_error"
  | "unknown";

export interface RithumLoginDiagnostics {
  code: RithumLoginErrorCode;
  url: string;
  title: string | null;
  visible_error: string | null;
  body_snippet: string | null;
  has_password_input: boolean;
  has_username_input: boolean;
  has_captcha: boolean;
  has_cloudflare: boolean;
  has_mfa_prompt: boolean;
  cookies_count: number;
  network_failures: string[];
  screenshot_bytes: number | null;
}

// Capturado durante toda la vida de la página — el caller debe atachar el
// listener con attachNetworkRecorder() antes del login.
export interface NetworkRecorder {
  failures: string[];
}

export function attachNetworkRecorder(page: Page): NetworkRecorder {
  const recorder: NetworkRecorder = { failures: [] };
  page.on("response", (resp) => {
    const status = resp.status();
    if (status >= 400) {
      const url = resp.url();
      // Ignorar trackers/CDN ruido — solo dominios relevantes
      if (/commercehub|auth0|cloudflare/i.test(url)) {
        recorder.failures.push(`${status} ${url.slice(0, 120)}`);
      }
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/commercehub|auth0|cloudflare/i.test(url)) {
      recorder.failures.push(`failed ${url.slice(0, 120)} reason=${req.failure()?.errorText ?? "?"}`);
    }
  });
  return recorder;
}

export interface RithumLoginDiagnosticsResult {
  diagnostics: RithumLoginDiagnostics;
  screenshot: Buffer | null;
}

// Inspecciona la página post-fallo y devuelve diagnóstico categorizado.
// El orden de detección importa — captcha y cloudflare se chequean
// primero porque pueden coexistir con un dashboard a medio cargar.
export async function diagnoseLoginFailure(
  page: Page,
  recorder: NetworkRecorder | null,
): Promise<RithumLoginDiagnosticsResult> {
  const url = page.url();
  const title = await page.title().catch(() => null);
  const visibleError = await readAuth0Error(page);

  // Snippet del body para post-mortem
  const bodySnippet = await page
    .locator("body")
    .innerText({ timeout: 1500 })
    .then((t) => t.slice(0, 600).replace(/\s+/g, " "))
    .catch(() => null);

  const isVisible = async (sel: string): Promise<boolean> => {
    const count = await page
      .locator(sel)
      .filter({ visible: true })
      .count()
      .catch(() => 0);
    return count > 0;
  };

  const hasCaptcha =
    (await isVisible('iframe[src*="recaptcha"]')) ||
    (await isVisible('iframe[src*="hcaptcha"]')) ||
    (await isVisible('[id^="g-recaptcha"]')) ||
    (await isVisible('[class*="captcha"]'));

  const hasCloudflare =
    /just a moment|attention required/i.test(title ?? "") ||
    /challenges\.cloudflare\.com/i.test(url) ||
    (await isVisible("#challenge-running, #cf-challenge-running, .cf-browser-verification"));

  const hasMfaPrompt =
    /\/u\/mfa|verification|two-?factor|totp/i.test(url) ||
    /verification code|enter the code|one-time code/i.test(bodySnippet ?? "") ||
    (await isVisible('input[name="code"], input[autocomplete="one-time-code"]'));

  const hasPasswordInput = await isVisible('input[name="password"], input[type="password"]');
  const hasUsernameInput = await isVisible('input[name="username"], input[type="email"]');

  const cookies = await page.context().cookies().catch(() => []);
  const networkFailures = recorder?.failures.slice(-15) ?? [];

  let screenshotBytes: number | null = null;
  let screenshotBuffer: Buffer | null = null;
  try {
    const buf = await page.screenshot({ fullPage: false, type: "png" });
    screenshotBytes = buf.length;
    screenshotBuffer = buf;
  } catch {
    /* ignore */
  }

  // ── Categorización (orden importa) ──────────────────────────────────────
  let code: RithumLoginErrorCode = "unknown";
  const errLower = (visibleError ?? "").toLowerCase();
  const bodyLower = (bodySnippet ?? "").toLowerCase();

  if (hasCloudflare) {
    code = "cloudflare_challenge";
  } else if (hasCaptcha) {
    code = "captcha_challenge";
  } else if (hasMfaPrompt) {
    code = "mfa_required";
  } else if (
    /wrong email or password|invalid.*credentials|incorrect/i.test(errLower) ||
    /wrong email or password|invalid.*credentials/i.test(bodyLower)
  ) {
    code = "invalid_credentials";
  } else if (
    /account.*locked|too many.*attempts|temporarily blocked/i.test(errLower + " " + bodyLower)
  ) {
    code = "account_locked";
  } else if (/network|timeout|disconnected|reset/i.test(errLower) || networkFailures.length > 5) {
    code = "network_error";
  } else if (/\/u\/login/i.test(url) && !hasPasswordInput) {
    // Estamos en login URL pero el campo de password desapareció — selector roto
    code = "password_submit_failed";
  } else if (/dsm\.commercehub\.com\/dsm\/gotoHome/i.test(url)) {
    // Login URL resolvió pero el dashboard no terminó de cargar
    code = "dashboard_not_reached";
  } else if (/\/u\/login/i.test(url) && hasPasswordInput) {
    // Seguimos atorados en el form de password — submit no avanzó
    code = "redirect_loop";
  }

  return {
    diagnostics: {
      code,
      url,
      title,
      visible_error: visibleError,
      body_snippet: bodySnippet,
      has_password_input: hasPasswordInput,
      has_username_input: hasUsernameInput,
      has_captcha: hasCaptcha,
      has_cloudflare: hasCloudflare,
      has_mfa_prompt: hasMfaPrompt,
      cookies_count: cookies.length,
      network_failures: networkFailures,
      screenshot_bytes: screenshotBytes,
    },
    screenshot: screenshotBuffer,
  };
}

// Error tipado lanzado por loginRithum — incluye el diagnóstico completo
// y el screenshot (PNG) para que el caller lo persista en storage.
export class RithumLoginError extends Error {
  readonly diagnostics: RithumLoginDiagnostics;
  readonly screenshot: Buffer | null;
  constructor(diagnostics: RithumLoginDiagnostics, screenshot: Buffer | null) {
    super(`rithum_login_failed:${diagnostics.code}|url=${diagnostics.url}`);
    this.name = "RithumLoginError";
    this.diagnostics = diagnostics;
    this.screenshot = screenshot;
  }
}

// Detecta el estado de error de Chrome (`chrome-error://chromewebdata/`,
// `about:blank` tras fallo, etc.) — típicamente network reset, TLS handshake
// fallido o DNS transitorio en cold start de serverless.
function isChromeErrorPage(url: string): boolean {
  return (
    url.startsWith("chrome-error://") ||
    url.startsWith("data:text/html") ||
    url === "about:blank" ||
    url === ""
  );
}

// Navega con reintentos exponenciales si Chrome devuelve una página de error.
// Estos errores son casi siempre transitorios (reset TCP/TLS, DNS frío) y
// resuelven con 1-2 reintentos a los pocos segundos.
async function navigateWithRetry(page: Page, url: string, attempts = 3, log: RLog = rLog0): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    log("info", "Navegando a Rithum...");
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
  throw new Error(`rithum_navigate_failed:url=${url}|reason=${detail.slice(0, 120)}`);
}

export async function loginRithum(page: Page, log: RLog = rLog0): Promise<void> {
  const username = process.env.RITHUM_USERNAME;
  const password = process.env.RITHUM_PASSWORD;
  if (!username || !password) throw new Error("rithum_credentials_missing");

  // El recorder captura responses 4xx/5xx y requestfailed durante todo el
  // flujo de login — útil para identificar block de Cloudflare o 401 del SSO.
  const recorder = attachNetworkRecorder(page);

  // Reintentos a nivel de login completo — si el callback de Auth0 termina en
  // chrome-error://, cerrar todos los cookies y empezar de cero suele resolverlo.
  const MAX_LOGIN_ATTEMPTS = 2;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    try {
      await doLoginAttempt(page, username, password, log);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      // Solo reintentamos en errores de red transitorios.
      const isRetryable =
        msg.includes("chrome-error://") ||
        msg.includes("chrome_error_page") ||
        msg.includes("rithum_navigate_failed") ||
        msg.includes("net::ERR_") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT");
      if (!isRetryable || attempt === MAX_LOGIN_ATTEMPTS) {
        // Si el error es del flujo de login (no de navegación / red),
        // capturar diagnóstico exhaustivo antes de relanzar.
        // Cualquier error del flujo de login (failed, *_not_found, etc.)
        // dispara diagnóstico completo antes de propagar.
        if (msg.startsWith("rithum_login")) {
          const { diagnostics, screenshot } = await diagnoseLoginFailure(page, recorder);
          throw new RithumLoginError(diagnostics, screenshot);
        }
        throw lastError;
      }
      // Limpiar cookies de Auth0 para forzar un login limpio en el reintento.
      log("warn", "Error de red — reintentando login...");
      await page.context().clearCookies().catch(() => {});
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError ?? new Error("rithum_login_failed:unknown");
}

async function doLoginAttempt(page: Page, username: string, password: string, log: RLog): Promise<void> {
  await navigateWithRetry(page, `${RITHUM_BASE_URL}/dsm/gotoHome.do`, 3, log);

  // Already in the dashboard — done.
  if (!isLoginUrl(page.url())) {
    log("ok", "Sesión activa — sin necesidad de login");
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});
    return;
  }

  // ── Step 1: identifier (email) ───────────────────────────────────────────
  if (AUTH0_HOST.test(page.url()) || /\/u\/login\/identifier/i.test(page.url())) {
    log("info", "Auth0 SSO detectado — ingresando credenciales...");
    await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT }).catch(() => {});
    // Pequeño margen para que Auth0 termine de hidratar el form (React SPA).
    // 800ms es suficiente en práctica; 2000ms era excesivo y acumulaba tiempo.
    await page.waitForTimeout(800);
    await page
      .waitForSelector('input, [role="textbox"]', {
        state: "visible",
        timeout: 25_000,
      })
      .catch(() => {
        /* try anyway */
      });

    await fillFirstVisible(
      page,
      [
        'input[name="username"]',
        "input#username",
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        'input[type="email"]',
        'input[type="text"]',
      ],
      username,
      "username",
    );
    log("info", "Email ingresado");

    await clickFirstVisible(
      page,
      [
        'button[type="submit"][name="action"]',
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'input[type="submit"]',
      ],
      "submit_step1",
    );
    log("info", "Step 1 enviado — esperando password...");

    // Wait for navigation to /u/login/password (or any URL change).
    await page
      .waitForURL((u) => !/\/u\/login\/identifier/i.test(u.toString()), {
        timeout: STEP_TIMEOUT,
      })
      .catch(() => {
        /* may be SPA — keep going */
      });
    await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT }).catch(() => {});
  }

  // ── Step 2: password ─────────────────────────────────────────────────────
  if (isLoginUrl(page.url())) {
    await page
      .waitForSelector('input[name="password"], input#password', {
        state: "visible",
        timeout: STEP_TIMEOUT,
      })
      .catch(() => {
        /* try anyway */
      });

    await fillFirstVisible(
      page,
      [
        'input[name="password"]',
        "input#password",
        'input[autocomplete="current-password"]',
        'input[type="password"]:not([aria-hidden="true"])',
      ],
      password,
      "password",
    );
    log("info", "Password ingresada");

    await clickFirstVisible(
      page,
      [
        'button[type="submit"][name="action"]',
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'input[type="submit"]',
      ],
      "submit_step2",
    );
    log("info", "Credenciales enviadas — esperando redirect...");
  }

  // ── Wait for Rithum dashboard to be fully ready ───────────────────────────
  // Solo verificamos el dominio y que no estemos en login — los selectores de
  // elementos del dashboard cambian con actualizaciones del portal (ej. mayo 2026).
  try {
    await page.waitForURL(
      (u) => {
        const s = u.toString();
        if (isChromeErrorPage(s)) return false; // fuerza timeout → retry externo
        return (
          /dsm\.commercehub\.com/i.test(s) &&
          !/\/u\/login|gotoLogin|account\.commercehub\.com/i.test(s)
        );
      },
      { timeout: NAV_TIMEOUT },
    );
    log("ok", "✓ Login exitoso");
  } catch {
    const finalUrl = page.url();
    // Si el callback de Auth0 terminó en chrome-error, intentar navegar de
    // vuelta al home antes de rendirse — la cookie de sesión puede haber sido
    // seteada incluso si el redirect falló.
    if (isChromeErrorPage(finalUrl)) {
      try {
        await navigateWithRetry(page, `${RITHUM_BASE_URL}/dsm/gotoHome.do`, 2, log);
        if (
          /dsm\.commercehub\.com/i.test(page.url()) &&
          !isLoginUrl(page.url())
        ) {
          log("ok", "✓ Login exitoso");
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
          return;
        }
      } catch {
        /* fall through al throw original */
      }
    }
    const errText = await readAuth0Error(page);
    throw new Error(
      `rithum_login_failed:err=${(errText ?? "no_visible_error").slice(0, 80)}|url=${page.url()}`,
    );
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

function isLoginUrl(url: string): boolean {
  return (
    /\/u\/login/i.test(url) ||
    /signin|login|gotoLogin|account\.commercehub\.com/i.test(url)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers compartidos entre runner.ts y scan-pending — buscadores del portal
// ─────────────────────────────────────────────────────────────────────────────

// Setea un <select> buscándolo por el texto visible de su label en el DOM.
// Resistente a cambios en `name`/`id`: ancla el campo a la etiqueta visible
// junto a él (label[for], celda hermana en tabla, o sibling adyacente).
// Devuelve true si encontró label, halló un select cercano y aplicó el valor.
export async function setSelectByLabel(
  page: Page,
  labelText: string,
  value: string,
): Promise<boolean> {
  return page.evaluate(
    ({ label, val }) => {
      const isVisible = (el: Element): boolean => {
        const he = el as HTMLElement;
        const rect = he.getBoundingClientRect();
        const cs = window.getComputedStyle(he);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          cs.display !== "none" &&
          cs.visibility !== "hidden"
        );
      };
      const labelLc = label.toLowerCase();
      const matchOption = (sel: HTMLSelectElement, target: string): boolean => {
        const t = target.toLowerCase();
        for (const opt of Array.from(sel.options)) {
          if (
            opt.label.trim().toLowerCase() === t ||
            opt.value.trim().toLowerCase() === t ||
            opt.text.trim().toLowerCase() === t
          ) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
        return false;
      };

      // Estrategia 1: <label for="..."> explícito.
      for (const lbl of Array.from(document.querySelectorAll("label"))) {
        const t = (lbl.textContent ?? "").trim().toLowerCase().replace(/[:\s]+$/, "");
        if (t !== labelLc) continue;
        const forId = lbl.getAttribute("for");
        if (!forId) continue;
        const tgt = document.getElementById(forId);
        if (tgt && tgt.tagName === "SELECT" && isVisible(tgt) && matchOption(tgt as HTMLSelectElement, val)) {
          return true;
        }
      }

      // Estrategia 2: label en celda/span, select en la misma fila o sibling.
      const labelHolders = Array.from(
        document.querySelectorAll("td, th, label, div, span"),
      );
      for (const holder of labelHolders) {
        const t = (holder.textContent ?? "").trim().toLowerCase().replace(/[:\s]+$/, "");
        if (t !== labelLc) continue;

        const seen = new Set<HTMLSelectElement>();
        const tryList = (selects: HTMLSelectElement[]): boolean => {
          for (const s of selects) {
            if (seen.has(s) || !isVisible(s)) continue;
            seen.add(s);
            if (matchOption(s, val)) return true;
          }
          return false;
        };

        const row = holder.closest("tr");
        if (row && tryList(Array.from(row.querySelectorAll("select")) as HTMLSelectElement[])) {
          return true;
        }

        let sib: Element | null = holder.nextElementSibling;
        let hops = 0;
        while (sib && hops < 6) {
          const inSib =
            sib.tagName === "SELECT"
              ? [sib as HTMLSelectElement]
              : (Array.from(sib.querySelectorAll("select")) as HTMLSelectElement[]);
          if (tryList(inSib)) return true;
          sib = sib.nextElementSibling;
          hops++;
        }
      }
      return false;
    },
    { label: labelText, val: value },
  );
}

// Usa la barra de búsqueda superior del portal Rithum — la que tiene
// "Search for [Orders - Purchase Order Number ▾] [Starting With ▾] [...] [Go]".
// Es el flujo canónico que un usuario haría desde el correo de alerta o desde
// el plugin manual. NO depende de `name="quicksearchType"` (Rithum lo rota):
// identifica los selects por el contenido de sus options ("Purchase Order
// Number" y "Starting With"), llena el input de texto visible vecino y hace
// click en Go.
//
// Tras el Go, Rithum:
//   - autonavega al detalle si hay 1 solo resultado, o
//   - muestra una lista de resultados (caller decide qué hacer con la lista).
export async function quickSearchByPo(page: Page, poNumber: string, log: RLog = rLog0): Promise<void> {
  log("info", `Buscando PO ${poNumber} en la barra de búsqueda...`);
  const filled = await page.evaluate((po: string) => {
    const isVisible = (el: Element): boolean => {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      const cs = window.getComputedStyle(he);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden"
      );
    };

    const allSelects = (Array.from(document.querySelectorAll("select")) as HTMLSelectElement[])
      .filter(isVisible);

    // Type select: contiene una option que menciona "purchase order number".
    const typeSel = allSelects.find((s) =>
      Array.from(s.options).some((o) => /purchase\s*order\s*number/i.test(o.text)),
    );
    if (typeSel) {
      const opt = Array.from(typeSel.options).find((o) =>
        /purchase\s*order\s*number/i.test(o.text),
      );
      if (opt) {
        typeSel.value = opt.value;
        typeSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Operator select: contiene "starting with".
    const opSel = allSelects.find((s) =>
      Array.from(s.options).some((o) => /^\s*starting\s*with\s*$/i.test(o.text)),
    );
    if (opSel) {
      const opt = Array.from(opSel.options).find((o) =>
        /^\s*starting\s*with\s*$/i.test(o.text),
      );
      if (opt) {
        opSel.value = opt.value;
        opSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Text input: el más cercano al typeSel en el mismo form/row, visible.
    const anchor = typeSel ?? opSel ?? allSelects[0] ?? null;
    if (!anchor) return false;
    const scope = anchor.closest("form") ?? anchor.closest("tr") ?? anchor.parentElement;
    if (!scope) return false;
    const inputs = (Array.from(
      scope.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]'),
    ) as HTMLInputElement[]).filter(isVisible);
    const input = inputs[0] ?? null;
    if (!input) return false;
    input.focus();
    input.value = po;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, poNumber);

  if (!filled) {
    log("error", `No se encontró la barra de búsqueda rápida en: ${page.url()}`);
    throw new Error(`rithum_quicksearch_input_not_found:url=${page.url()}`);
  }

  // Click "Go" — el botón visible más próximo a la barra de búsqueda.
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
  log("info", "Resultados cargados");
}

// ─── Sesión persistente ─────────────────────────────────────────────────────
// Cachea el storageState de Playwright en Supabase Storage para reutilizar
// cookies/localStorage entre jobs. Una sesión válida hace que doLoginAttempt
// detecte "sesión activa" en gotoHome.do y retorne sin tocar Auth0 — saltando
// el flujo entero de login y reduciendo la exposición a anti-bot.
//
// El estado es por-tenant porque las credenciales son por-tenant. Si la sesión
// expira, el siguiente login normal lo refresca y vuelve a guardar.

const SESSIONS_BUCKET = "rithum-sessions";
// Sesiones más viejas que esto se descartan para forzar un login fresco.
// Auth0 suele invalidar las cookies de sesión a las 24h, pero Cloudflare
// puede volver a challengear sesiones que llevan mucho tiempo sin usarse.
// 8h es un balance conservador: cubre un turno laboral sin arriesgarse a
// usar una cookie que el portal ya rechazó.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface RithumSessionFile {
  saved_at: string; // ISO-8601
  state: RithumStorageState;
}

type SessionStorageClient = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>;
      upload: (
        path: string,
        body: Blob | Buffer | string,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

export async function loadRithumSession(
  client: SessionStorageClient,
  tenantId: string,
  log: RLog = rLog0,
): Promise<RithumStorageState | null> {
  try {
    const { data, error } = await client.storage
      .from(SESSIONS_BUCKET)
      .download(`${tenantId}/state.json`);
    if (error || !data) {
      log("info", "Sin sesión cacheada — login normal");
      return null;
    }
    const text = await data.text();
    if (!text) return null;

    const parsed: unknown = JSON.parse(text);

    // Formato nuevo: { saved_at, state }
    if (typeof parsed === "object" && parsed !== null && "saved_at" in parsed && "state" in parsed) {
      const file = parsed as RithumSessionFile;
      const ageMs = Date.now() - new Date(file.saved_at).getTime();
      if (ageMs > SESSION_TTL_MS) {
        log("warn", `Sesión expirada (${Math.round(ageMs / 3_600_000)}h) — login fresco`);
        return null;
      }
      log("info", `Sesión válida (${Math.round(ageMs / 60_000)}min) — reutilizando`);
      return file.state;
    }

    // Formato antiguo: storageState directo — usar pero no confiar en frescura
    log("info", "Sesión cacheada (formato legacy) — reutilizando");
    return parsed as unknown as RithumStorageState;
  } catch (err) {
    log("warn", `Error leyendo sesión: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function saveRithumSession(
  client: SessionStorageClient,
  tenantId: string,
  context: BrowserContext,
  log: RLog = rLog0,
): Promise<void> {
  try {
    const state = await context.storageState();
    const file: RithumSessionFile = { saved_at: new Date().toISOString(), state };
    const { error } = await client.storage
      .from(SESSIONS_BUCKET)
      .upload(`${tenantId}/state.json`, JSON.stringify(file), {
        contentType: "application/json",
        upsert: true,
      });
    if (error) {
      log("warn", `No se pudo guardar sesión: ${error.message ?? "?"}`);
      return;
    }
    log("info", "Sesión guardada (TTL 8h)");
  } catch (err) {
    log("warn", `Error guardando sesión: ${err instanceof Error ? err.message : String(err)}`);
  }
}
