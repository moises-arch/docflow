// Email: digest diario — Editorial Luxury.
// Hero number masivo, eyebrow microscópico, stats type-driven (no chips heavy),
// alerts como lista editorial con accent vertical, button-in-button CTA.

import { baseLayout, ctaButton, escHtml, eyebrow, hairline, FONT_STACK, PALETTE as C } from "./base";
import { interpolate } from "../send";
import { renderUserContent } from "../sanitize-rich-text";

export interface DigestError {
  title: string;
  description: string | null;
  created_at: string;
}

export interface DigestData {
  period: string;
  approvedCount: number;
  pendingCount: number;
  failedCount: number;
  errors: DigestError[];
  subject: string;
  intro: string;
  dashboardUrl?: string;
}

export function renderDailyDigestEmail(data: DigestData): { html: string; text: string } {
  const total = data.approvedCount + data.pendingCount + data.failedCount;
  const hasOrders = total > 0;
  const introHtml = renderUserContent(data.intro);
  const dashboardUrl = data.dashboardUrl ?? "https://app.example.com/dashboard";
  const approvalRate = hasOrders ? Math.round((data.approvedCount / total) * 100) : 0;
  const headlineWord = total === 1 ? "documento procesado" : "documentos procesados";

  const content = `

${eyebrow(data.period)}

<!-- Editorial hero: número masivo + sub claro -->
<h1 class="docflow-hero docflow-text-ink" style="margin:0 0 14px;font-family:${FONT_STACK};color:${C.ink};font-size:72px;font-weight:700;letter-spacing:-3px;line-height:0.95;">
  ${total}
</h1>
<p class="docflow-hero-sub docflow-text-body" style="margin:0 0 ${hasOrders ? "20" : "32"}px;font-family:${FONT_STACK};color:${C.body};font-size:18px;font-weight:400;letter-spacing:-0.3px;line-height:1.45;max-width:480px;">
  ${hasOrders ? `${escHtml(headlineWord)} en el período.` : "Sin actividad registrada en el período."}
</p>

${hasOrders ? approvalRateLine(approvalRate, data.approvedCount, total) : ""}

<!-- Intro personalizable -->
<div class="docflow-text-body" style="margin:0 0 44px;font-family:${FONT_STACK};color:${C.body};font-size:14.5px;line-height:1.65;letter-spacing:-0.05px;">
  ${introHtml}
</div>

${hasOrders ? statsBlock(data) : emptyStateBlock()}

${data.errors.length > 0 ? errorsBlock(data.errors) : ""}

<!-- CTA editorial -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 0;">
  <tr>
    <td align="center">
      ${ctaButton("Abrir dashboard", dashboardUrl)}
    </td>
  </tr>
</table>

<p class="docflow-text-faint" style="margin:20px 0 0;text-align:center;font-family:${FONT_STACK};color:${C.faint};font-size:11.5px;font-weight:500;letter-spacing:0.1px;">
  Métricas completas, drill-down por proveedor y trazabilidad en DocFlow
</p>

${hairline(44)}

<p class="docflow-text-muted" style="margin:0;font-family:${FONT_STACK};color:${C.muted};font-size:12px;font-weight:400;letter-spacing:0.05px;line-height:1.7;">
  Este reporte se envía automáticamente a las <strong class="docflow-text-body" style="color:${C.inkSoft};font-weight:600;">8:00 AM</strong> y <strong class="docflow-text-body" style="color:${C.inkSoft};font-weight:600;">3:00 PM</strong> hora de Panamá. Configurá destinatarios y plantilla desde <span class="docflow-text-body" style="color:${C.inkSoft};font-weight:500;">Settings → Notificaciones</span>.
</p>
`;

  const preheaderParts = hasOrders
    ? [`${data.approvedCount} aprobadas`, `${data.pendingCount} pendientes`, `${data.failedCount} fallidas`, `${approvalRate}% éxito`]
    : [`Sin actividad en ${data.period}`];

  const html = baseLayout(content, {
    preheader: preheaderParts.join(" · "),
  });

  return { html, text: buildText(data, approvalRate) };
}

/**
 * Línea editorial de tasa de aprobación — sin pill, tipográfica.
 * Color del % según umbral; resto en muted.
 */
function approvalRateLine(rate: number, approved: number, total: number): string {
  const accent =
    rate >= 90 ? "#047857" :
    rate >= 70 ? "#B45309" :
                 "#B91C1C";

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 36px;">
  <tr>
    <td style="vertical-align:baseline;padding-right:14px;font-family:${FONT_STACK};color:${accent};font-size:24px;font-weight:700;letter-spacing:-0.8px;line-height:1;">
      ${rate}%
    </td>
    <td style="vertical-align:baseline;border-left:1px solid ${C.hairline};padding-left:14px;font-family:${FONT_STACK};color:${C.muted};font-size:12px;font-weight:500;letter-spacing:0.2px;line-height:1.4;text-transform:uppercase;" class="docflow-hairline docflow-text-muted">
      Tasa de<br/>aprobación
    </td>
    <td style="vertical-align:baseline;border-left:1px solid ${C.hairline};padding-left:14px;padding-right:0;font-family:${FONT_STACK};color:${C.muted};font-size:12px;font-weight:400;letter-spacing:0.1px;line-height:1.4;" class="docflow-hairline docflow-text-muted">
      ${approved} aprobadas<br/><span style="color:${C.faint};">de ${total} procesadas</span>
    </td>
  </tr>
</table>`;
}

function statsBlock(data: DigestData): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="docflow-section-gap" style="margin:0 0 40px;">
  <tr class="docflow-stat-row">
    ${statCell("Aprobadas", data.approvedCount, "#047857", "#D1FAE5")}
    <td class="docflow-stat-gap" style="width:12px;line-height:12px;font-size:12px;">&nbsp;</td>
    ${statCell("Pendientes", data.pendingCount, "#B45309", "#FEF3C7")}
    <td class="docflow-stat-gap" style="width:12px;line-height:12px;font-size:12px;">&nbsp;</td>
    ${statCell("Fallidas", data.failedCount, "#B91C1C", "#FEE2E2")}
  </tr>
</table>`;
}

function statCell(label: string, value: number, accent: string, dotBg: string): string {
  return `
<td class="docflow-stat-cell docflow-card docflow-hairline" style="background-color:${C.card};border:1px solid ${C.hairline};border-radius:16px;padding:24px 22px 22px;width:33.33%;vertical-align:top;">
  <!-- Dot indicator + label -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr>
      <td style="vertical-align:middle;padding-right:8px;line-height:0;">
        <div style="width:8px;height:8px;background-color:${accent};border-radius:999px;display:inline-block;border:2px solid ${dotBg};box-sizing:content-box;"></div>
      </td>
      <td class="docflow-text-muted" style="vertical-align:middle;font-family:${FONT_STACK};color:${C.muted};font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;line-height:1;">${escHtml(label)}</td>
    </tr>
  </table>
  <!-- Big editorial number -->
  <div class="docflow-stat-num docflow-text-ink" style="font-family:${FONT_STACK};color:${C.ink};font-size:42px;font-weight:700;letter-spacing:-1.8px;line-height:1;">${value}</div>
</td>`;
}

function emptyStateBlock(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="docflow-section-gap" style="margin:0 0 40px;">
  <tr>
    <td class="docflow-card docflow-hairline" style="background-color:${C.card};border:1px solid ${C.hairline};border-radius:16px;padding:44px 28px;text-align:center;">
      <div class="docflow-text-ink" style="font-family:${FONT_STACK};color:${C.ink};font-size:15px;font-weight:600;letter-spacing:-0.2px;line-height:1.4;margin-bottom:6px;">Sin actividad en este período</div>
      <div class="docflow-text-muted" style="font-family:${FONT_STACK};color:${C.muted};font-size:13px;font-weight:400;letter-spacing:0;line-height:1.55;">Las integraciones siguen activas y monitoreando.</div>
    </td>
  </tr>
</table>`;
}

function errorsBlock(errors: DigestError[]): string {
  const rows = errors.map((e, i) => `
  <tr>
    <td style="padding:18px 22px 18px 0;border-top:${i === 0 ? "none" : `1px solid ${C.hairSoft}`};" class="docflow-hair-soft">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:top;padding-right:14px;">
            <div style="font-family:${FONT_STACK};color:#7F1D1D;font-size:13.5px;font-weight:600;letter-spacing:-0.15px;line-height:1.4;">${escHtml(e.title)}</div>
            ${e.description ? `<div style="margin-top:4px;font-family:${FONT_STACK};color:#9A2929;font-size:12.5px;font-weight:400;letter-spacing:0;line-height:1.55;opacity:0.9;">${escHtml(e.description)}</div>` : ""}
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;">
            <span style="font-family:${FONT_STACK};color:#B91C1C;font-size:11px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;opacity:0.7;">
              ${escHtml(new Date(e.created_at).toLocaleTimeString("es-PA", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit" }))}
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`).join("");

  return `
<!-- Errors: lista editorial con accent vertical sutil -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="docflow-section-gap" style="margin:0 0 40px;">
  <tr>
    <td style="padding-bottom:18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;padding-right:10px;line-height:0;">
            <div style="width:6px;height:6px;background-color:#DC2626;border-radius:999px;display:inline-block;"></div>
          </td>
          <td style="vertical-align:middle;font-family:${FONT_STACK};color:#B91C1C;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;line-height:1;">Alertas · ${errors.length}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding-left:22px;border-left:2px solid #FECACA;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${rows}
      </table>
    </td>
  </tr>
</table>`;
}

function buildText(data: DigestData, approvalRate: number): string {
  const total = data.approvedCount + data.pendingCount + data.failedCount;
  const lines = [
    `DocFlow · ${data.period}`,
    `═════════════════════════════════════════`,
    ``,
    `${total} ${total === 1 ? "documento procesado" : "documentos procesados"}`,
    total > 0 ? `${approvalRate}% tasa de aprobación · ${data.approvedCount} de ${total}` : `Sin actividad`,
    ``,
    data.intro.replace(/<[^>]+>/g, "").trim(),
    ``,
    `  · Aprobadas    ${data.approvedCount}`,
    `  · Pendientes   ${data.pendingCount}`,
    `  · Fallidas     ${data.failedCount}`,
  ];
  if (data.errors.length > 0) {
    lines.push("", `ALERTAS (${data.errors.length})`, ``);
    data.errors.forEach((e) => {
      lines.push(`  · ${e.title}${e.description ? ` — ${e.description}` : ""}`);
    });
  }
  if (total === 0 && data.errors.length === 0) {
    lines.push("", "Sin actividad en este período.");
  }
  lines.push("", `Abrir dashboard → ${data.dashboardUrl ?? "https://app.example.com/dashboard"}`);
  lines.push("", `─────────────────────────────────────────`, `DocFlow · AI Document Processing · DocFlow`);
  return lines.join("\n");
}

export function interpolateDigestVars(
  template: string,
  data: Pick<DigestData, "period" | "approvedCount" | "pendingCount" | "failedCount">,
): string {
  const total = data.approvedCount + data.pendingCount + data.failedCount;
  const approvalRate = total > 0 ? Math.round((data.approvedCount / total) * 100) : 0;
  return interpolate(template, {
    period: data.period,
    approved_count: data.approvedCount,
    pending_count: data.pendingCount,
    error_count: data.failedCount,
    total_count: total,
    approval_rate: approvalRate,
  });
}
