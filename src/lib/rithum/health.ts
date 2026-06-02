// Shared deep-smoke logic. Used by both the deep-smoke API route (manual
// dashboard test) and the healthcheck cron (every 6h auto-monitoring).
// Performs a real Auth0 login + dashboard navigation and reports each step.

import { type Browser, type Page } from "playwright-core";
import { createServiceClient } from "@/lib/supabase/service";
import {
  launchBrowser,
  createRithumContext,
  RITHUM_BASE_URL,
  NAV_TIMEOUT,
} from "@/lib/rithum/browser";

export type HealthStep = { name: string; ok: boolean; ms: number; detail?: string };

export type HealthResult = {
  ok: boolean;
  steps: HealthStep[];
  final_url: string;
  form_inspections: Array<{
    stage: string;
    url: string;
    visibleInputs: unknown[];
    visibleButtons: unknown[];
  }>;
};

async function runStep<T>(
  steps: HealthStep[],
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, ms: Date.now() - start });
    return result;
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    steps.push({ name, ok: false, ms: Date.now() - start, detail: detail.slice(0, 300) });
    return null;
  }
}

async function inspectFormFields(page: Page) {
  const url = page.url();
  const visibleInputs = await page.evaluate(() => {
    function isVisible(el: HTMLElement): boolean {
      const cs = window.getComputedStyle(el);
      return (
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        el.getAttribute("aria-hidden") !== "true"
      );
    }
    return (Array.from(document.querySelectorAll("input")) as HTMLInputElement[])
      .filter(isVisible)
      .map((i) => ({
        name: i.name || undefined,
        id: i.id || undefined,
        type: i.type || undefined,
        placeholder: i.placeholder || undefined,
        autocomplete: i.autocomplete || undefined,
      }));
  });
  const visibleButtons = await page.evaluate(() => {
    function isVisible(el: HTMLElement): boolean {
      const cs = window.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && el.offsetWidth > 0 && el.offsetHeight > 0;
    }
    return (Array.from(document.querySelectorAll("button, input[type='submit']")) as HTMLElement[])
      .filter(isVisible)
      .map((b) => ({
        text: (b.textContent || (b as HTMLInputElement).value || "").trim().slice(0, 40),
        type: (b as HTMLButtonElement | HTMLInputElement).type || undefined,
        name: (b as HTMLButtonElement | HTMLInputElement).name || undefined,
      }))
      .slice(0, 10);
  });
  return { url, visibleInputs, visibleButtons };
}

export async function runRithumDeepSmoke(): Promise<HealthResult> {
  const steps: HealthStep[] = [];
  const formInspections: HealthResult["form_inspections"] = [];
  let finalUrl = "";
  let browser: Browser | null = null;

  await runStep(steps, "env_credentials", async () => {
    if (!process.env.RITHUM_USERNAME) throw new Error("RITHUM_USERNAME not set");
    if (!process.env.RITHUM_PASSWORD) throw new Error("RITHUM_PASSWORD not set");
    return true;
  });

  await runStep(steps, "db_rithum_orders_table", async () => {
    const svc = createServiceClient();
    const { error } = await svc.from("rithum_orders").select("id").limit(1);
    if (error) throw new Error(error.message);
    return true;
  });

  await runStep(steps, "db_rithum_smoke_runs_table", async () => {
    const svc = createServiceClient();
    const { error } = await svc.from("rithum_smoke_runs").select("id").limit(1);
    if (error) throw new Error(error.message);
    return true;
  });

  browser = await runStep(steps, "playwright_launch", async () => {
    return await launchBrowser();
  });
  if (!browser) {
    return { ok: false, steps, final_url: finalUrl, form_inspections: formInspections };
  }

  try {
    const context = await runStep(steps, "browser_context", async () => {
      if (!browser) throw new Error("browser is null");
      return await createRithumContext(browser);
    });
    if (!context) {
      return { ok: false, steps, final_url: finalUrl, form_inspections: formInspections };
    }

    const page = await context.newPage();

    await runStep(steps, "navigate_home", async () => {
      await page.goto(`${RITHUM_BASE_URL}/dsm/gotoHome.do`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      return page.url();
    });

    const inspect1 = await runStep(steps, "inspect_login_page", async () => {
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      return await inspectFormFields(page);
    });
    if (inspect1) formInspections.push({ stage: "step1_identifier", ...inspect1 });

    await runStep(steps, "step1_fill_username", async () => {
      const candidates = [
        'input[name="username"]',
        "input#username",
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        'input[type="email"]',
        'input[type="text"]',
      ];
      for (const sel of candidates) {
        const loc = page.locator(sel).filter({ visible: true });
        if (await loc.count()) {
          await loc.first().fill(process.env.RITHUM_USERNAME!, { timeout: 10_000 });
          return sel;
        }
      }
      throw new Error("no_visible_username_input");
    });

    await runStep(steps, "step1_submit", async () => {
      const candidates = [
        'button[type="submit"][name="action"]',
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'input[type="submit"]',
      ];
      for (const sel of candidates) {
        const loc = page.locator(sel).filter({ visible: true });
        if (await loc.count()) {
          await loc.first().click({ timeout: 10_000 });
          return sel;
        }
      }
      throw new Error("no_visible_submit_button");
    });

    await runStep(steps, "wait_password_page", async () => {
      await page
        .waitForURL((u) => !/\/u\/login\/identifier/i.test(u.toString()), {
          timeout: 15_000,
        })
        .catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      return page.url();
    });

    const inspect2 = await runStep(steps, "inspect_password_page", async () => {
      return await inspectFormFields(page);
    });
    if (inspect2) formInspections.push({ stage: "step2_password", ...inspect2 });

    await runStep(steps, "step2_fill_password", async () => {
      const candidates = [
        'input[name="password"]',
        "input#password",
        'input[autocomplete="current-password"]',
      ];
      for (const sel of candidates) {
        const loc = page.locator(sel).filter({ visible: true });
        if (await loc.count()) {
          await loc.first().fill(process.env.RITHUM_PASSWORD!, { timeout: 10_000 });
          return sel;
        }
      }
      throw new Error("no_visible_password_input");
    });

    await runStep(steps, "step2_submit", async () => {
      const candidates = [
        'button[type="submit"][name="action"]',
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
        'button:has-text("Sign in")',
      ];
      for (const sel of candidates) {
        const loc = page.locator(sel).filter({ visible: true });
        if (await loc.count()) {
          await loc.first().click({ timeout: 10_000 });
          return sel;
        }
      }
      throw new Error("no_visible_submit_button_step2");
    });

    await runStep(steps, "wait_dashboard", async () => {
      await page.waitForURL(
        (u) =>
          /dsm\.commercehub\.com/i.test(u.toString()) &&
          !/\/u\/login/i.test(u.toString()),
        { timeout: NAV_TIMEOUT },
      );
      finalUrl = page.url();
      return finalUrl;
    });

    await runStep(steps, "dashboard_verified", async () => {
      const hasOrderActions = await page.evaluate(() =>
        document.body.textContent?.includes("Order Actions") ?? false,
      );
      if (!hasOrderActions) throw new Error("Order Actions widget not found");
      return true;
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const ok = steps.every((s) => s.ok);
  return { ok, steps, final_url: finalUrl, form_inspections: formInspections };
}
