// Convierte HTML de Tiptap a HTML email-safe con estilos inline.
// Solo permite tags básicos. Cualquier otra cosa se strip.
// No usa librerías de inlining (juice) — convertimos a mano lo mínimo necesario
// para mantener bundle chico y comportamiento predecible.

const ALLOWED_INLINE_TAGS = new Set(["strong", "em", "u", "s", "code", "br", "a"]);
const ALLOWED_BLOCK_TAGS = new Set(["p", "ul", "ol", "li", "h1", "h2", "h3", "blockquote"]);
const ALLOWED_TAGS = new Set([...ALLOWED_INLINE_TAGS, ...ALLOWED_BLOCK_TAGS]);

const STYLE: Record<string, string> = {
  p: "margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;",
  h1: "margin:0 0 16px;font-size:20px;font-weight:700;line-height:1.3;color:#111827;",
  h2: "margin:0 0 12px;font-size:17px;font-weight:600;line-height:1.3;color:#111827;",
  h3: "margin:0 0 8px;font-size:14px;font-weight:600;line-height:1.4;color:#111827;",
  ul: "margin:0 0 12px 20px;padding:0;font-size:14px;line-height:1.6;color:#374151;",
  ol: "margin:0 0 12px 20px;padding:0;font-size:14px;line-height:1.6;color:#374151;",
  li: "margin:0 0 4px;",
  strong: "font-weight:600;color:#111827;",
  em: "font-style:italic;",
  u: "text-decoration:underline;",
  s: "text-decoration:line-through;",
  code: "background-color:#f3f4f6;padding:1px 5px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:12px;color:#dc2626;",
  blockquote: "margin:0 0 12px;padding:8px 14px;border-left:3px solid #8b5cf6;background-color:#faf5ff;font-size:13px;color:#4c1d95;font-style:italic;",
  a: "color:#7c3aed;text-decoration:underline;",
};

/**
 * Sanitiza HTML del editor Tiptap a HTML inline-styled compatible con email.
 *
 * - Strip de tags no permitidos (script, style, iframe, etc.)
 * - Strip de event handlers (onclick, onerror, etc.)
 * - href en <a> debe ser http(s) o mailto
 * - Aplica estilos inline a cada tag permitido
 */
export function sanitizeRichTextForEmail(html: string): string {
  if (!html) return "";

  // 1. Strip tags peligrosos (script, style, iframe, object, embed, etc.) completos.
  let safe = html.replace(/<(script|style|iframe|object|embed|link|meta|form|input|textarea|button|svg|math)[\s\S]*?<\/\1>/gi, "");
  // También strip self-closing peligrosos.
  safe = safe.replace(/<(script|style|iframe|object|embed|link|meta|input)[^>]*\/?>/gi, "");

  // 2. Strip event handlers (on*="...") y atributos javascript:
  safe = safe.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/javascript:/gi, "");

  // 3. Procesar cada tag — aplicar estilos inline y validar atributos.
  safe = safe.replace(/<(\/?)(\w+)([^>]*)>/gi, (_match, slash, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Strip tag pero conservar contenido
      return "";
    }
    if (slash === "/") {
      return `</${tag}>`;
    }
    const style = STYLE[tag] ?? "";
    // Para <a>, conservar href si es seguro
    if (tag === "a") {
      const hrefMatch = rawAttrs.match(/href\s*=\s*"([^"]*)"/i);
      const href = hrefMatch ? hrefMatch[1] : "";
      const safeHref = /^(https?:|mailto:)/i.test(href) ? href : "#";
      return `<a href="${escAttr(safeHref)}" target="_blank" rel="noreferrer" style="${style}">`;
    }
    return `<${tag} style="${style}">`;
  });

  return safe.trim();
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Detecta si un string contiene HTML (tags). Útil para decidir si usar
 * sanitizeRichTextForEmail (HTML del editor) o escapar como plaintext (legacy).
 */
export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(s);
}

/**
 * Si el contenido es texto plano (legacy), lo envuelve en <p> con escape.
 * Si ya viene como HTML del editor, lo pasa por el sanitizer.
 */
export function renderUserContent(content: string): string {
  if (!content) return "";
  if (looksLikeHtml(content)) {
    return sanitizeRichTextForEmail(content);
  }
  // Plain text — escape y envolver en párrafos por línea.
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n\n+/).map((p) => p.replace(/\n/g, "<br>"));
  return paragraphs
    .map((p) => `<p style="${STYLE.p}">${p}</p>`)
    .join("");
}
