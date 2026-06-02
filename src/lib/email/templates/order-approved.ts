// Email: orden aprobada — Editorial Luxury.
// Hero PO editorial, importe tipográfico grande (sin pill heavy), detail block
// como type-driven table, button-in-button CTA.

import { baseLayout, ctaButton, escHtml, eyebrow, hairline, FONT_STACK, PALETTE as C } from "./base";
import { interpolate } from "../send";
import { renderUserContent } from "../sanitize-rich-text";

export interface OrderApprovedData {
  poNumber: string;
  partner: string;
  total: string;
  currency: string;
  approvedAt: string;
  odooSoName: string;
  odooSoUrl: string | null;
  subject: string;
  intro: string;
  /** Nº de líneas en la orden — opcional, se muestra en meta + detail. */
  lineCount?: number;
}

export function renderOrderApprovedEmail(data: OrderApprovedData): { html: string; text: string } {
  const approvedDate = new Date(data.approvedAt).toLocaleString("es-PA", {
    timeZone: "America/Panama",
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const introHtml = renderUserContent(data.intro);
  const { currencyBadge, amount } = splitCurrency(data.total, data.currency);

  const content = `

${eyebrow("Orden aprobada", "#047857", "transparent", "#A7F3D0")}

<!-- Editorial hero -->
<h1 class="docflow-hero docflow-text-ink" style="margin:0 0 12px;font-family:${FONT_STACK};color:${C.ink};font-size:56px;font-weight:700;letter-spacing:-2.2px;line-height:1;">
  PO ${escHtml(data.poNumber)}
</h1>
<p class="docflow-hero-sub docflow-text-body" style="margin:0 0 36px;font-family:${FONT_STACK};color:${C.body};font-size:18px;font-weight:400;letter-spacing:-0.3px;line-height:1.45;max-width:480px;">
  Sincronizada en Odoo como <strong class="docflow-text-ink" style="color:${C.ink};font-weight:600;">${escHtml(data.odooSoName)}</strong>.
</p>

<!-- Meta tipográfica: amount + currency + lineas con hairline divider -->
${metaLine(currencyBadge, amount, data.lineCount)}

<!-- Intro personalizable -->
<div class="docflow-text-body" style="margin:0 0 44px;font-family:${FONT_STACK};color:${C.body};font-size:14.5px;line-height:1.65;letter-spacing:-0.05px;">
  ${introHtml}
</div>

<!-- Detail rows — sin enclosing box, solo hairlines horizontales -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="docflow-section-gap" style="margin:0 0 44px;">
  ${detailRow("Proveedor", `<span style="font-family:${FONT_STACK};font-size:14px;font-weight:500;" class="docflow-text-ink">${escHtml(data.partner)}</span>`, true)}
  ${detailRow("Importe", `<span style="font-family:${FONT_STACK};font-size:15px;font-weight:700;letter-spacing:-0.4px;" class="docflow-text-ink">${escHtml(data.total)}</span>`)}
  ${data.lineCount && data.lineCount > 0 ? detailRow("Líneas", `<span style="font-family:${FONT_STACK};font-size:14px;font-weight:500;" class="docflow-text-body">${data.lineCount} ${data.lineCount === 1 ? "ítem" : "ítems"}</span>`) : ""}
  ${detailRow("Sale order", `<span style="font-family:${FONT_STACK};color:#047857;font-size:14px;font-weight:700;letter-spacing:0.2px;">${escHtml(data.odooSoName)}</span>`)}
  ${detailRow("Aprobado", `<span style="font-family:${FONT_STACK};font-size:13.5px;font-weight:400;" class="docflow-text-muted">${escHtml(approvedDate)}</span>`)}
  <!-- Hairline cierre (top + bottom de la lista) -->
  <tr><td class="docflow-hairline" style="border-top:1px solid ${C.hairline};height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr>
</table>

${data.odooSoUrl ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td align="center">
      ${ctaButton("Ver orden en Odoo", data.odooSoUrl)}
    </td>
  </tr>
</table>

<p class="docflow-text-faint" style="margin:20px 0 0;text-align:center;font-family:${FONT_STACK};color:${C.faint};font-size:11.5px;font-weight:500;letter-spacing:0.1px;">
  Te abrirá <span class="docflow-text-muted" style="color:${C.muted};font-weight:600;">${escHtml(data.odooSoName)}</span> en el ERP
</p>
` : ""}

${hairline(44)}

<p class="docflow-text-muted" style="margin:0;font-family:${FONT_STACK};color:${C.muted};font-size:12px;font-weight:400;letter-spacing:0.05px;line-height:1.7;">
  Envío automático de <strong class="docflow-text-body" style="color:${C.inkSoft};font-weight:600;">DocFlow</strong> al confirmar la sincronización de la orden con Odoo. Si la información no es correcta, contactá al equipo de operaciones.
</p>
`;

  const html = baseLayout(content, {
    preheader: `${data.partner} · PO ${data.poNumber} → ${data.odooSoName} · ${data.total}`,
  });

  return { html, text: buildText(data, approvedDate) };
}

/**
 * Separa "USD 1,234.00" en { currencyBadge: "USD", amount: "1,234.00" }.
 */
function splitCurrency(total: string, fallbackCurrency: string): { currencyBadge: string | null; amount: string } {
  const match = total.match(/^([A-Z]{3})\s+(.+)$/);
  if (match) return { currencyBadge: match[1], amount: match[2] };
  return { currencyBadge: fallbackCurrency || null, amount: total };
}

/**
 * Meta line: importe grande tipográfico + currency en eyebrow style + chip de líneas.
 * Separado con hairlines verticales (sin pill heavy).
 */
function metaLine(currency: string | null, amount: string, lineCount?: number): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="docflow-meta-chips" style="margin:0 0 40px;">
  <tr>
    <td style="vertical-align:baseline;padding-right:18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${currency ? `<td class="docflow-text-faint" style="vertical-align:baseline;padding-right:10px;font-family:${FONT_STACK};color:${C.faint};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;line-height:1;">${escHtml(currency)}</td>` : ""}
          <td class="docflow-text-ink" style="vertical-align:baseline;font-family:${FONT_STACK};color:${C.ink};font-size:26px;font-weight:700;letter-spacing:-1px;line-height:1;">${escHtml(amount)}</td>
        </tr>
      </table>
    </td>
    ${lineCount && lineCount > 0 ? `
    <td class="docflow-meta-divider docflow-hairline" style="vertical-align:baseline;border-left:1px solid ${C.hairline};padding-left:18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="docflow-text-ink" style="vertical-align:baseline;padding-right:8px;font-family:${FONT_STACK};color:${C.ink};font-size:18px;font-weight:600;letter-spacing:-0.4px;line-height:1;">${lineCount}</td>
          <td class="docflow-text-muted" style="vertical-align:baseline;font-family:${FONT_STACK};color:${C.muted};font-size:12px;font-weight:500;letter-spacing:0.6px;text-transform:uppercase;line-height:1;">${lineCount === 1 ? "línea" : "líneas"}</td>
        </tr>
      </table>
    </td>` : ""}
  </tr>
</table>`;
}

function detailRow(label: string, valueHtml: string, first = false): string {
  // Primer row tiene hairline fuerte (cierre superior), resto soft entre filas.
  const borderTop = first ? `1px solid ${C.hairline}` : `1px solid ${C.hairSoft}`;
  const cls = first ? "docflow-hairline" : "docflow-hair-soft";
  return `
  <tr>
    <td class="${cls}" style="padding:20px 0;border-top:${borderTop};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td class="docflow-detail-label docflow-text-faint" style="vertical-align:middle;font-family:${FONT_STACK};color:${C.faint};font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;width:38%;">
            ${escHtml(label)}
          </td>
          <td class="docflow-detail-value" style="vertical-align:middle;text-align:right;">
            ${valueHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildText(data: OrderApprovedData, approvedDate: string): string {
  const lines = [
    `ORDEN APROBADA`,
    `═════════════════════════════════════════`,
    ``,
    `PO ${data.poNumber}`,
    `Sincronizada en Odoo como ${data.odooSoName}`,
    ``,
    data.intro.replace(/<[^>]+>/g, "").trim(),
    ``,
    `  Proveedor    ${data.partner}`,
    `  Importe      ${data.total}`,
    ...(data.lineCount && data.lineCount > 0 ? [`  Líneas       ${data.lineCount}`] : []),
    `  Sale order   ${data.odooSoName}`,
    `  Aprobado     ${approvedDate}`,
  ];
  if (data.odooSoUrl) {
    lines.push("", `Ver en Odoo → ${data.odooSoUrl}`);
  }
  lines.push("", `─────────────────────────────────────────`, `DocFlow · AI Document Processing · DocFlow`);
  return lines.join("\n");
}

export function interpolateOrderVars(
  template: string,
  data: Pick<OrderApprovedData, "poNumber" | "partner" | "total" | "odooSoName"> & { lineCount?: number },
): string {
  return interpolate(template, {
    po_number: data.poNumber,
    partner: data.partner,
    total: data.total,
    odoo_so: data.odooSoName,
    line_count: data.lineCount ?? 0,
  });
}
