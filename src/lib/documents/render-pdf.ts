// Shared browser-launch + HTML-to-PDF utility for document generation.
// Uses @sparticuz/chromium + playwright-core (serverless-safe).
// Returns null on failure — non-fatal, caller decides what to do.

import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";

async function launchBrowser() {
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
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

/**
 * Renders an HTML string to a PDF Buffer using Playwright.
 * Returns null on any failure — the caller must handle the missing PDF.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer | null> {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1056, height: 1400 },
    });
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: "networkidle", timeout: 15_000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });

    if (!pdf || pdf.length < 4 || pdf.subarray(0, 4).toString() !== "%PDF") {
      return null;
    }
    return Buffer.from(pdf);
  } catch (err) {
    console.warn("documents_pdf_render_warning:", err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
