// Rithum (CommerceHub OrderStream) runner — logs in to dsm.commercehub.com,
// resolves the internal Hub_PO from the public PO Number, navigates to the
// canonical order detail page, captures the HTML and renders it to PDF.
// Mirror of `lib/cleo/runner.ts`. The portal does NOT expose a native PDF
// download, so `pdf_source` is always `'html_render'`.
//
// Trigger comes from email-pipeline when a "Rithum New Order Alert" is
// received. One job = one PO Number. Idempotency enforced by
// rithum_orders unique on (tenant_id, rithum_order_number).

import { createServiceClient } from "@/lib/supabase/service";
import { type Browser, type Page } from "playwright-core";
import { createHash, randomUUID } from "crypto";
import { parseRithumHtml } from "@/lib/rithum/parse-html";
import { applyParsedToDraft } from "@/lib/rithum/apply-parsed";
import { getBrowserMode } from "@/lib/browser-mode";
import {
  launchBrowser,
  createRithumContext,
  loginRithum,
  loadRithumSession,
  saveRithumSession,
  quickSearchByPo,
  RithumLoginError,
  RITHUM_BASE_URL,
  NAV_TIMEOUT,
  type RLog,
  rLog0,
} from "@/lib/rithum/browser";

// rithum_orders is created in migration 20260508160001 — types regen happens
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

export type RithumJob = {
  tenant_id: string;
  inbound_email_id: string | null;
  rithum_order_number: string;
  rithum_partner: string;
  rithum_partner_pid: "thehomedepot" | "walmartmp" | "thdso" | null;
  rithum_order_date: string | null;
  subject: string | null;
  from_email: string;
};

export type RithumResult =
  | { ok: true; document_id: string; rithum_order_id: string; size_bytes: number }
  | { ok: false; reason: string; rithum_order_id: string | null };


// ── Helpers ────────────────────────────────────────────────────────────────

// Verdadero si la página actual es el detalle de una orden. Tres heurísticas
// en cascada (más a menos específica) para sobrevivir cambios de UI de Rithum:
//   1. URL contiene orderid=N o Hub_PO=N
//   2. Widget "Order Summary" visible (class antigua .fw_widget_windowtag_topbar_title)
//   3. Texto "Order Summary" en el body + algún elemento que parezca card/widget
function isOnOrderDetailPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const url = window.location.href;
    if (/orderid=\d+/i.test(url) || /Hub_PO=\d+/i.test(url)) return true;

    const oldTitles = Array.from(
      document.querySelectorAll(".fw_widget_windowtag_topbar_title"),
    ) as HTMLElement[];
    if (oldTitles.some((t) => /order\s+summary/i.test(t.textContent ?? ""))) return true;

    const bodyText = document.body?.innerText ?? "";
    if (/order\s+summary/i.test(bodyText)) {
      // Confirmar que es página de detalle (no lista) — ausencia de tabla de resultados.
      const resultRows = document.querySelectorAll(
        'a[href*="Hub_PO="], a[href*="orderid="]',
      );
      // En el detalle puede haber un solo link self-reference. En la lista hay muchos.
      if (resultRows.length <= 2) return true;
    }
    return false;
  });
}

// Extrae Hub_PO de una lista de resultados de búsqueda. Estrategias en cascada
// para tolerar variaciones: texto del link puede ser exacto, contener el PO
// como substring (p.ej. "PO 321074660"), o el PO puede estar en una celda
// vecina al link de "Hub_PO=...".
function extractHubPoFromList(page: Page, poNumber: string): Promise<string | null> {
  return page.evaluate((po) => {
    const links = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    // Rithum a veces emite el link como href, otras como onclick="...gotoOrderRealmDisplay.do?orderid=..."
    // o data-href. Consideramos los tres.
    const hubPoFromEl = (a: HTMLAnchorElement): string | null => {
      const candidates = [
        a.getAttribute("href") ?? "",
        a.getAttribute("onclick") ?? "",
        a.getAttribute("data-href") ?? "",
        a.getAttribute("data-url") ?? "",
      ];
      for (const s of candidates) {
        const m =
          s.match(/Hub_PO=(\d+)/i) ??
          s.match(/orderid["'\s=]+(\d+)/i);
        if (m) return m[1];
      }
      return null;
    };

    // 1) Match exacto del texto del link.
    for (const a of links) {
      if ((a.textContent ?? "").trim() === po) {
        const id = hubPoFromEl(a);
        if (id) return id;
      }
    }

    // 2) PO como substring del texto del link.
    for (const a of links) {
      const text = (a.textContent ?? "").trim();
      if (text.length > 0 && text.includes(po)) {
        const id = hubPoFromEl(a);
        if (id) return id;
      }
    }

    // 3) Buscar el PO en celdas y tomar el link de orden de la misma fila.
    const cells = Array.from(document.querySelectorAll("td, th"));
    for (const cell of cells) {
      const text = (cell.textContent ?? "").trim();
      if (text !== po && !text.includes(po)) continue;
      const row = cell.closest("tr");
      if (!row) continue;
      for (const a of Array.from(row.querySelectorAll("a")) as HTMLAnchorElement[]) {
        const id = hubPoFromEl(a);
        if (id) return id;
      }
    }

    return null;
  }, poNumber);
}

// Cuenta cuántos resultados visibles parecen ser órdenes. Útil para distinguir
// "lista vacía" de "lista con resultados pero no encontramos el PO".
function countResultLinks(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Cubre href, onclick y data-attrs porque Rithum no siempre emite el orderid en el href.
    const links = document.querySelectorAll(
      'a[href*="Hub_PO="], a[href*="orderid="], a[href*="gotoOrderRealmDisplay"], a[onclick*="Hub_PO"], a[onclick*="orderid"], a[onclick*="gotoOrderRealmDisplay"], a[data-href*="orderid="], a[data-url*="orderid="]',
    );
    return links.length;
  });
}

// Captura el HTML de los widgets desde la página de detalle actual.
async function captureWidgetHtml(page: Page): Promise<string> {
  const html = await page.evaluate(() => {
    const widgets = Array.from(
      document.querySelectorAll(".fw_widget_windowtag"),
    ) as HTMLElement[];
    const poHeader =
      document.querySelector("h1, h2")?.outerHTML ??
      `<h1>PO ${document.title}</h1>`;
    return `<div class="rithum-order-detail">${poHeader}${widgets
      .map((w) => w.outerHTML)
      .join("\n")}</div>`;
  });
  if (!html || html.length < 200)
    throw new Error(`rithum_html_capture_empty:size=${html?.length ?? 0}`);
  return html;
}

// Navega directamente al detalle por Hub_PO y verifica que cargó.
async function gotoDetailByHubPo(page: Page, hubPo: string): Promise<boolean> {
  await page.goto(
    `${RITHUM_BASE_URL}/dsm/gotoOrderRealmDisplay.do?orderid=${encodeURIComponent(hubPo)}&action=web_view`,
    { waitUntil: "networkidle", timeout: NAV_TIMEOUT },
  );
  return isOnOrderDetailPage(page);
}

// Navega al detalle de una orden replicando exactamente el flujo del usuario:
// usa la barra de búsqueda superior (Search for: Orders - Purchase Order Number
// / Starting With / <PO> / Go) y, según lo que devuelva Rithum, sigue al detalle
// directamente o clickea el resultado en la lista. Mismo flujo para email
// trigger y para dispatch manual desde el plugin.
//
// `partnerPid` se mantiene en la firma por compatibilidad pero ya no se usa —
// la búsqueda superior es global y no necesita filtro por merchant.
async function navigateToDetailPage(
  page: Page,
  poNumber: string,
  _partnerPid: string | null,
  log: RLog = rLog0,
): Promise<void> {
  // Asegurar que estamos en una página con la barra de búsqueda (post-login).
  if (!/dsm\.commercehub\.com/i.test(page.url())) {
    await page.goto(`${RITHUM_BASE_URL}/dsm/gotoHome.do`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  }

  await quickSearchByPo(page, poNumber, log);

  // Tras el Go, Rithum puede:
  //   a) autonavegar al detalle (1 resultado) → estamos en la página de detalle
  //   b) mostrar una lista de resultados → buscar el PO en los links
  //   c) mostrar lista vacía → no encontrado

  if (await isOnOrderDetailPage(page)) return;

  // Si el URL trae orderid, ir directo.
  const urlMatch = page.url().match(/orderid=(\d+)/i);
  if (urlMatch && (await gotoDetailByHubPo(page, urlMatch[1]))) return;

  // Lista de resultados: buscar Hub_PO por texto exacto, substring o celda vecina.
  const hubPo = await extractHubPoFromList(page, poNumber);
  if (hubPo && (await gotoDetailByHubPo(page, hubPo))) return;

  // Diagnóstico claro según el estado de la página:
  //   - 0 resultados → la búsqueda no devolvió la orden (PO inexistente o filtrado)
  //   - >0 resultados pero no matcheamos → cambio de markup, hay que ajustar selectores
  const resultCount = await countResultLinks(page);
  if (resultCount === 0) {
    throw new Error(
      `rithum_hub_po_not_found:po=${poNumber}|reason=no_results|url=${page.url()}`,
    );
  }
  throw new Error(
    `rithum_hub_po_not_found:po=${poNumber}|reason=results_present_no_match|count=${resultCount}|url=${page.url()}`,
  );
}

async function downloadOrderAsPdf(
  page: Page,
  poNumber: string,
  partnerPid: string | null,
  log: RLog = rLog0,
): Promise<{ pdf: Buffer; html: string }> {
  // Navegar al detalle por cualquier método disponible.
  await navigateToDetailPage(page, poNumber, partnerPid, log);

  // Capturar HTML de widgets desde la página actual.
  const html = await captureWidgetHtml(page);
  log("info", "HTML capturado — generando PDF...");

  // Render the cleaned HTML to PDF in a fresh page so we don't disturb the
  // authenticated session in `page`.
  const printPage = await page.context().newPage();
  try {
    const fullHtml = `<!doctype html><html><head><meta charset="utf-8">
<base href="${RITHUM_BASE_URL}/">
<style>
  @page { margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Source Sans Pro", Arial, sans-serif;
    font-size: 11.5px; color: #222; margin: 0; padding: 0;
    line-height: 1.45;
  }
  h1, h2 {
    font-size: 15px; color: #03418f; margin: 0 0 14px;
    padding-bottom: 6px; border-bottom: 2px solid #03418f;
  }
  .rithum-order-detail { padding: 4px 0; }

  /* Widget cards */
  .fw_widget_windowtag {
    border: 1px solid #c8d8ea; border-radius: 4px;
    margin-bottom: 12px; overflow: hidden;
  }
  .fw_widget_windowtag_topbar {
    background: linear-gradient(to right, #03418f, #1a5bb5);
    padding: 6px 12px; display: flex; align-items: center;
  }
  .fw_widget_windowtag_topbar_title {
    color: #fff; font-weight: 700; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .fw_widget_windowtag_body { padding: 10px 12px; }

  /* Tables */
  table { border-collapse: collapse; width: 100%; margin: 0; }
  thead tr { background: #e8f0f9; }
  th {
    background: #dce8f5; color: #03418f; font-weight: 600;
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em;
    padding: 5px 8px; border: 1px solid #c8d8ea; text-align: left;
  }
  td {
    padding: 4px 8px; border: 1px solid #e0e8f0;
    vertical-align: top; font-size: 11px;
  }
  tr:nth-child(even) td { background: #f7fafd; }

  /* Label-value pairs (two-column grids inside widgets) */
  td:first-child:not(:only-child) {
    color: #555; font-weight: 500; width: 38%;
  }
</style>
</head><body>${html}</body></html>`;

    await printPage.emulateMedia({ media: "print" });
    await printPage.setViewportSize({ width: 1056, height: 800 });
    await printPage.setContent(fullHtml, { waitUntil: "networkidle", timeout: NAV_TIMEOUT });
    await printPage.waitForTimeout(800);
    const contentHeightPx = await printPage.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    );
    const heightInches = Math.min(48, Math.max(11, contentHeightPx / 96 + 1.2));
    const pdf = await printPage.pdf({
      width: "11in",
      height: `${heightInches}in`,
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    if (!pdf || pdf.length < 4 || pdf.subarray(0, 4).toString() !== "%PDF") {
      throw new Error("rithum_pdf_render_invalid");
    }
    log("ok", `✓ PDF generado (${(pdf.length / 1024).toFixed(0)} KB)`);
    return { pdf: Buffer.from(pdf), html };
  } finally {
    await printPage.close().catch(() => {});
  }
}

async function sha256Hex(bytes: Buffer): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runRithumJob(job: RithumJob, log: RLog = rLog0): Promise<RithumResult> {
  const supabase = createServiceClient();
  const rithum = supabase as unknown as AnyTableClient;

  // 1. Pre-check: si ya está descargada no tocar el estado. El upsert con
  // state:"running" sobreescribiría "downloaded" antes de que podamos verificar.
  const { data: preCheck } = await supabase
    .from("rithum_orders" as "documents")
    .select("id, state, document_id, attempts")
    .eq("tenant_id", job.tenant_id)
    .eq("rithum_order_number" as "id", job.rithum_order_number)
    .maybeSingle();
  const pre = preCheck as { id: string; state: string; document_id: string | null; attempts: number } | null;
  if (pre?.state === "downloaded" && pre.document_id) {
    return {
      ok: true,
      document_id: pre.document_id,
      rithum_order_id: pre.id,
      size_bytes: 0,
    };
  }

  // 2. Upsert rithum_orders row (idempotent on tenant + po_number)
  const { data: orderRow, error: orderError } = await rithum
    .from("rithum_orders")
    .upsert(
      {
        tenant_id: job.tenant_id,
        rithum_order_number: job.rithum_order_number,
        rithum_partner: job.rithum_partner,
        inbound_email_id: job.inbound_email_id,
        state: "running",
      },
      { onConflict: "tenant_id,rithum_order_number" },
    )
    .select("id, state, document_id, attempts")
    .single();

  if (orderError || !orderRow) {
    return {
      ok: false,
      reason: orderError?.message ?? "rithum_order_upsert_failed",
      rithum_order_id: null,
    };
  }

  const existing = orderRow as {
    id: string;
    state: string;
    document_id: string | null;
    attempts: number;
  };
  if (existing.state === "downloaded" && existing.document_id) {
    return {
      ok: true,
      document_id: existing.document_id,
      rithum_order_id: existing.id,
      size_bytes: 0,
    };
  }

  let browser: Browser | null = null;
  try {
    await rithum
      .from("rithum_orders")
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

    // Intentar reutilizar la sesión cacheada — si las cookies siguen
    // válidas, loginRithum detecta "sesión activa" en gotoHome.do y
    // retorna sin tocar Auth0.
    const cachedState = await loadRithumSession(supabase, job.tenant_id, log);
    const context = await createRithumContext(browser, cachedState ?? undefined);
    const page = await context.newPage();

    await loginRithum(page, log);
    // Login exitoso — refrescar el storageState para el próximo job.
    // No bloqueamos el flujo si falla la subida.
    await saveRithumSession(supabase, job.tenant_id, context, log);
    log("info", `Procesando PO ${job.rithum_order_number}...`);
    log("info", "Navegando al detalle de la orden...");
    const { pdf, html } = await downloadOrderAsPdf(page, job.rithum_order_number, job.rithum_partner_pid, log);
    // Hub_PO es el orderid interno — best-effort desde el URL final de la página.
    const hubPo = page.url().match(/orderid=(\d+)/i)?.[1] ?? null;

    if (!pdf || pdf.length === 0) throw new Error("rithum_pdf_empty");
    if (pdf.length > 25 * 1024 * 1024) throw new Error("rithum_pdf_too_large");

    let parsed: ReturnType<typeof parseRithumHtml> | null = null;
    try {
      parsed = parseRithumHtml(html, job.rithum_partner);
    } catch (err) {
      console.warn("rithum_html_parse_warning:", err);
    }

    // 2. Upload PDF + HTML to Storage
    const documentId = randomUUID();
    const ts = new Date().toISOString().slice(0, 7);
    const storagePath = `${job.tenant_id}/rithum/${ts}/${documentId}.pdf`;
    const htmlStoragePath = `${job.tenant_id}/rithum/${ts}/${documentId}.html`;

    log("info", "Subiendo documento a storage...");
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`rithum_storage_upload_failed:${uploadError.message}`);
    await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(htmlStoragePath, html, { contentType: "text/html", upsert: false })
      .catch((err) => console.warn("rithum_html_upload_warning:", err));

    // 3. Resolve provider_id por trading_partner — matcher normalizado que
    // tolera diferencias en puntuación (& vs +, etc.) y consulta aliases.
    // Mismo helper que cleo runner.
    let providerId: string | null = null;
    if (job.rithum_partner) {
      type ProviderCandidate = { id: string; name: string; settings: Record<string, unknown> | null };
      const { data: allProviders } = await (
        supabase.from("providers") as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => Promise<{ data: ProviderCandidate[] | null }>;
          };
        }
      )
        .select("id, name, settings")
        .eq("tenant_id", job.tenant_id);

      const normalize = (s: string | null | undefined): string =>
        !s
          ? ""
          : s
              .toLowerCase()
              .normalize("NFKD")
              .replace(/[̀-ͯ]/g, "")
              .replace(/[&+./\-_,'"`()]+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

      const target = normalize(job.rithum_partner);
      if (target) {
        for (const p of allProviders ?? []) {
          const candidates: string[] = [p.name];
          const aliases = (p.settings ?? {})["aliases"];
          if (Array.isArray(aliases)) {
            for (const a of aliases) {
              if (typeof a === "string" && a.trim()) candidates.push(a);
            }
          }
          if (candidates.some((c) => normalize(c) === target)) {
            providerId = p.id;
            break;
          }
        }
      }
    }

    // 4. Create documents row
    const checksum = await sha256Hex(pdf);
    const partnerSlug = (job.rithum_partner ?? "rithum")
      .replace(/[^a-z0-9]+/gi, "_")
      .slice(0, 40);
    const originalName = `${partnerSlug}-${job.rithum_order_number}.pdf`;
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
        source: "rithum",
        rithum_order_number: job.rithum_order_number,
        rithum_partner: job.rithum_partner,
        rithum_partner_pid: job.rithum_partner_pid,
        rithum_order_date: job.rithum_order_date,
        hub_po: hubPo,
        inbound_email_id: job.inbound_email_id,
        checksum,
        provider_match_method: providerId ? "trading_partner_name" : null,
      },
    };
    const { data: docRow, error: docError } = await (
      supabase.from("documents") as unknown as {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message?: string } | null;
            }>;
          };
        };
      }
    )
      .insert(documentInsert)
      .select("id")
      .single();
    if (docError || !docRow)
      throw new Error(`rithum_document_insert_failed:${docError?.message ?? "unknown"}`);

    // Archive prior documents for the same PO Number so the inbox shows only
    // the latest run.
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
      .eq("source_meta->>rithum_order_number", job.rithum_order_number)
      .neq("id", documentId);

    // 5. Mark rithum_order downloaded + persist parsed payload + html path
    await rithum
      .from("rithum_orders")
      .update({
        state: "downloaded",
        document_id: documentId,
        parsed_payload: parsed,
        pdf_source: "html_render",
        html_storage_path: htmlStoragePath,
        meta: hubPo ? { hub_po: hubPo } : undefined,
      })
      .eq("id", existing.id);

    // 6. Trigger AI ingest pipeline (best-effort)
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ document_id: documentId, tenant_id: job.tenant_id }),
    }).catch(() => {});

    // 7. Apply parsed payload to draft (best-effort, async-safe)
    if (parsed && parsed.lines.length > 0) {
      try {
        const apply = await applyParsedToDraft(documentId, job.tenant_id, providerId, parsed);
        if (apply.draft_id) {
          console.log(
            `rithum apply OK: draft=${apply.draft_id} lines=${apply.lines_inserted} unmatched=${apply.unmatched_skus.join(",")}`,
          );
        }
      } catch (err) {
        console.warn("rithum_apply_warning:", err);
      }
    }

    log("ok", `✓ Orden descargada — doc ${documentId}`);
    return {
      ok: true,
      document_id: documentId,
      rithum_order_id: existing.id,
      size_bytes: pdf.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log("error", reason);

    // Guard de raíz: no degradar una orden ya completada. Si un paso posterior
    // a marcar "downloaded" (ingest, applyParsedToDraft, cierre del browser)
    // lanza, el éxito ya persistido —y su posible sync a Odoo— no debe
    // revertirse a "failed".
    const { data: completed } = await supabase
      .from("rithum_orders" as "documents")
      .select("state, document_id")
      .eq("id", existing.id)
      .maybeSingle();
    const done = completed as { state: string; document_id: string | null } | null;
    if (done?.state === "downloaded" && done.document_id) {
      log("ok", `Error posterior a la descarga ignorado (orden ya completada): ${reason}`);
      return { ok: true, document_id: done.document_id, rithum_order_id: existing.id, size_bytes: 0 };
    }

    // ETXTBSY = Chromium binary busy (concurrent launch). launchBrowser() already
    // retried 4 times, so this is a persistent collision. Roll back the attempt
    // counter so it doesn't eat one of the 3 real retries — the cron will pick
    // it up on the next cycle when the binary is free.
    if (reason.includes("ETXTBSY")) {
      await rithum
        .from("rithum_orders")
        .update({ attempts: Math.max(0, existing.attempts), state: "failed", last_error: reason })
        .eq("id", existing.id);
      return { ok: false, reason, rithum_order_id: existing.id };
    }

    // If the error is rithum_hub_po_not_found and we already retried more than
    // 3 times, mark as manual_required so the operator can upload by hand.
    const isManualEdge =
      reason.includes("rithum_hub_po_not_found") || reason.includes("rithum_order_detail_not_found");

    // Errores de login no-retryables — reintentar no resuelve nada y sólo
    // gasta intentos. Si el code cae en este set se va directo a manual_required
    // para que el operador descargue manualmente el PDF.
    const NON_RETRYABLE_LOGIN_CODES = new Set<string>([
      "invalid_credentials",
      "mfa_required",
      "account_locked",
      "captcha_challenge",
      "cloudflare_challenge",
    ]);
    const isNonRetryableLogin =
      err instanceof RithumLoginError &&
      NON_RETRYABLE_LOGIN_CODES.has(err.diagnostics.code);

    const finalState =
      isNonRetryableLogin || (isManualEdge && existing.attempts >= 3)
        ? "manual_required"
        : "failed";

    const update: Record<string, unknown> = { state: finalState, last_error: reason };

    // RithumLoginError trae diagnóstico categorizado + screenshot —
    // se persiste para post-mortem y para que el cron decida estrategia
    // de retry (ej. no reintentar invalid_credentials).
    if (err instanceof RithumLoginError) {
      update.last_error_code = err.diagnostics.code;
      update.last_error_diagnostics = err.diagnostics;
      if (err.screenshot) {
        try {
          const path = `${existing.id}/${Date.now()}.png`;
          const { error: upErr } = await supabase
            .storage
            .from("rithum-diagnostics")
            .upload(path, err.screenshot, { contentType: "image/png", upsert: false });
          if (!upErr) update.failure_screenshot_path = path;
          else log("warn", `screenshot upload failed: ${upErr.message ?? "?"}`);
        } catch (e) {
          log("warn", `screenshot upload threw: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    await rithum.from("rithum_orders").update(update).eq("id", existing.id);
    return { ok: false, reason, rithum_order_id: existing.id };
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
