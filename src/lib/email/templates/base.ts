// Layout HTML base para emails de DocFlow.
// Vibe: Editorial Luxury — canvas crema cálido (#FAF9F6), espresso (#0F0E0C),
// hairlines tintadas (#EAE6DD), display type grande, macro-whitespace agresivo.
// Sin doppelrand. Concentric radii (card 18 / chip 999 / button 999).
// Button-in-Button CTA con icon flush al borde interior.
// Cross-client: Gmail/Outlook/Apple Mail/iOS/Yahoo/Spark/Superhuman/HEY.

export interface BaseLayoutOptions {
  preheader?: string;
  accentColor?: string;
}

// Display: SF Pro Display (Mac/iOS), Segoe UI (Win), Helvetica/Arial fallback.
// Editorial-tight. Mantenemos system stack para evitar @font-face (Outlook strip).
const DISPLAY = "'SF Pro Display','SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_STACK = DISPLAY;

// Paleta editorial fría — zinc/neutral
const C = {
  canvas:    "#F4F4F5", // cool off-white (zinc-100)
  card:      "#FFFFFF",
  hairline:  "#E4E4E7", // zinc-200 — solo para dividers internos, NO card border
  hairSoft:  "#F4F4F5", // intra-card divider, casi imperceptible
  ink:       "#09090B", // zinc-950 near-black
  inkSoft:   "#27272A", // zinc-800
  body:      "#3F3F46", // zinc-700
  muted:     "#71717A", // zinc-500
  faint:     "#A1A1AA", // zinc-400
  whisper:   "#D4D4D8", // zinc-300
} as const;

export function baseLayout(content: string, opts: BaseLayoutOptions = {}): string {
  const preheader = opts.preheader ?? "";
  void opts.accentColor;
  const ts = new Date().toLocaleDateString("es-PA", {
    timeZone: "America/Panama",
    year: "numeric", month: "long", day: "numeric",
  });

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>DocFlow</title>
<!--[if mso]>
<style type="text/css">
table, td, div, h1, h2, h3, p, a, span { font-family: 'Segoe UI', Arial, sans-serif !important; }
</style>
<xml>
<o:OfficeDocumentSettings>
<o:AllowPNG/>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style type="text/css">
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
  a { color:inherit; text-decoration:none; }

  /* === Responsive (mobile <600px) === */
  @media only screen and (max-width: 600px) {
    .docflow-canvas-pad { padding:20px 12px !important; }
    .docflow-card-pad { padding:36px 26px 30px !important; }
    .docflow-hero { font-size:48px !important; letter-spacing:-2px !important; }
    .docflow-hero-sub { font-size:16px !important; }
    .docflow-section-gap { margin-bottom:28px !important; }
    .docflow-stat-row { display:block !important; width:100% !important; }
    .docflow-stat-cell { display:block !important; width:100% !important; box-sizing:border-box; margin-bottom:10px; }
    .docflow-stat-gap { display:none !important; }
    .docflow-stat-num { font-size:36px !important; }
    .docflow-detail-label { display:block !important; width:100% !important; padding-bottom:6px !important; text-align:left !important; }
    .docflow-detail-value { display:block !important; width:100% !important; text-align:left !important; }
    .docflow-footer-text { font-size:11px !important; }
    .docflow-logo { width:160px !important; max-width:160px !important; }
    .docflow-meta-chips td { display:block !important; padding:0 0 10px !important; border:none !important; }
    .docflow-meta-divider { display:none !important; }
  }

  /* === Dark mode (Apple Mail, iOS, Outlook macOS/iOS, HEY) === */
  @media (prefers-color-scheme: dark) {
    body, .docflow-body { background-color:#0A0A0B !important; color:#E4E4E7 !important; }
    .docflow-canvas { background-color:#0A0A0B !important; }
    .docflow-card { background-color:#161618 !important; }
    .docflow-text-ink { color:#FAFAFA !important; }
    .docflow-text-body { color:#D4D4D8 !important; }
    .docflow-text-muted { color:#A1A1AA !important; }
    .docflow-text-faint { color:#71717A !important; }
    .docflow-hairline { border-color:#27272A !important; }
    .docflow-hair-soft { border-color:#1E1E20 !important; }
    .docflow-eyebrow-default { background-color:#161618 !important; border-color:#27272A !important; }
    .docflow-eyebrow-text { color:#A1A1AA !important; }
    .docflow-cta-bg { background-color:#FAFAFA !important; color:#09090B !important; }
    .docflow-cta-text { color:#09090B !important; }
    .docflow-cta-icon { background-color:#09090B !important; color:#FAFAFA !important; }
    .docflow-cta-icon-arrow { color:#FAFAFA !important; }
    .docflow-logo { filter:invert(1) brightness(1.05) !important; }
  }
  /* Outlook.com / Hotmail dark mode */
  [data-ogsc] body, [data-ogsc] .docflow-body { background-color:#0A0A0B !important; color:#E4E4E7 !important; }
  [data-ogsc] .docflow-card { background-color:#161618 !important; }
  [data-ogsc] .docflow-text-ink { color:#FAFAFA !important; }
  [data-ogsc] .docflow-text-body { color:#D4D4D8 !important; }
  [data-ogsc] .docflow-text-muted { color:#A1A1AA !important; }
  [data-ogsc] .docflow-hairline { border-color:#27272A !important; }
</style>
</head>
<body class="docflow-body" style="margin:0;padding:0;background-color:${C.canvas};color:${C.ink};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};">${escHtml(preheader)} ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌ ‌</div>` : ""}

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="docflow-canvas" style="background-color:${C.canvas};">
  <tr>
    <td align="center" class="docflow-canvas-pad" style="padding:56px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;">

        <!-- Wordmark -->
        <tr>
          <td align="center" style="padding:0 0 40px;">
            <!--[if mso]>
            <span style="font-family:'Segoe UI',Arial,sans-serif;color:${C.ink};font-size:18px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;">
              DocFlow
            </span>
            <![endif]-->
            <!--[if !mso]><!-- -->
            <img
              src="https://app.example.com/app-logo.svg"
              alt="DocFlow"
              width="260"
              height="24"
              class="docflow-logo"
              style="display:inline-block;border:0;outline:none;text-decoration:none;height:auto;max-width:260px;width:260px;color:${C.ink};"
            />
            <!--<![endif]-->
          </td>
        </tr>

        <!-- Editorial card — sin border, separado por contraste de fondos -->
        <tr>
          <td class="docflow-card" style="background-color:${C.card};border-radius:18px;overflow:hidden;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="docflow-card-pad" style="padding:64px 64px 56px;">
                  ${content}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer editorial -->
        <tr>
          <td align="center" style="padding:36px 24px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;">
              <tr>
                <td align="center" style="padding-bottom:14px;">
                  <span class="docflow-footer-text docflow-text-muted" style="font-family:${FONT_STACK};color:${C.muted};font-size:11px;font-weight:500;letter-spacing:0.4px;line-height:1.7;">
                    Notificación automática &nbsp;·&nbsp; <span style="color:${C.faint};">${escHtml(ts)}</span> &nbsp;·&nbsp; <span style="color:${C.faint};">Hora Panamá</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:12px;">
                  <span class="docflow-footer-text docflow-text-faint" style="font-family:${FONT_STACK};color:${C.faint};font-size:11px;font-weight:400;letter-spacing:0.2px;line-height:1.6;">
                    DocFlow &nbsp;·&nbsp; Panamá &nbsp;·&nbsp; <a href="mailto:developer@example.com" style="color:${C.muted};text-decoration:underline;text-underline-offset:2px;">developer@example.com</a>
                  </span>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <span class="docflow-footer-text docflow-text-faint" style="font-family:${FONT_STACK};color:${C.whisper};font-size:10px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;line-height:1.6;">
                    DocFlow &nbsp;—&nbsp; AI Document Processing
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Eyebrow tag — pill microscópico, uppercase, tracking ancho */
export function eyebrow(label: string, color: string = C.muted, bg: string = "transparent", border: string = C.hairline): string {
  const isDefault = color === C.muted && bg === "transparent";
  const cls = isDefault ? 'class="docflow-eyebrow-default"' : "";
  const textCls = isDefault ? 'class="docflow-eyebrow-text"' : "";
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
  <tr>
    <td ${cls} style="background-color:${bg};border:1px solid ${border};border-radius:999px;padding:6px 14px;">
      <span ${textCls} style="font-family:${FONT_STACK};color:${color};font-size:10px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;line-height:1;">${escHtml(label)}</span>
    </td>
  </tr>
</table>`;
}

/**
 * Button-in-Button CTA — el texto del label y un círculo nested con la flecha,
 * pegado al inset derecho. Editorial luxury pill negro/cream.
 */
export function ctaButton(label: string, href: string, accentColor = C.ink): string {
  const safeHref = escHtml(href);
  const safeLabel = escHtml(label);
  return `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:56px;v-text-anchor:middle;width:280px;" arcsize="50%" strokecolor="${accentColor}" fillcolor="${accentColor}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.2px;">${safeLabel} &nbsp;&nbsp;→</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${safeHref}" target="_blank" rel="noreferrer" class="docflow-cta-bg" style="background-color:${accentColor};border-radius:999px;color:#FFFFFF;display:inline-block;font-family:${FONT_STACK};text-decoration:none;-webkit-text-size-adjust:none;padding:8px 8px 8px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle;">
    <tr>
      <td class="docflow-cta-text" style="vertical-align:middle;color:#FFFFFF;font-family:${FONT_STACK};font-size:14px;font-weight:600;letter-spacing:0.1px;line-height:40px;padding-right:14px;">${safeLabel}</td>
      <td class="docflow-cta-icon" style="vertical-align:middle;background-color:#FFFFFF;border-radius:999px;width:40px;height:40px;text-align:center;line-height:40px;">
        <span class="docflow-cta-icon-arrow" style="display:inline-block;color:${accentColor};font-family:${FONT_STACK};font-size:15px;font-weight:500;line-height:40px;">↗</span>
      </td>
    </tr>
  </table>
</a>
<!--<![endif]-->`;
}

/** Hairline horizontal — tintada, casi imperceptible */
export function hairline(spacing = 36, soft = false): string {
  const color = soft ? C.hairSoft : C.hairline;
  const cls = soft ? "docflow-hair-soft" : "docflow-hairline";
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:${spacing}px 0;">
  <tr><td class="${cls}" style="border-top:1px solid ${color};height:1px;line-height:1px;font-size:1px;">&nbsp;</td></tr>
</table>`;
}

/** Strips HTML for plaintext fallback. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

export { FONT_STACK, C as PALETTE };
