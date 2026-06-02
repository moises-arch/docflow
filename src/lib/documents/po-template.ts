// Premium Purchase Order HTML template for DocFlow.
// Rendered to PDF by Playwright via renderHtmlToPdf().

export type PoAddress = {
  name?: string | null;
  line1?: string | null;
  street?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type PoLine = {
  sku: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number | null;
};

export type PoData = {
  po_number: string;
  po_date: string | null;
  currency: string | null;
  buyer: PoAddress | null;
  shipping_address: PoAddress | null;
  billing_address: PoAddress | null;
  notes: string | null;
  payment_terms: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  odoo_so_name: string | null;
  providerName?: string;
  lines: PoLine[];
  logoDataUrl?: string | null;
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(n: number | null | undefined, currency = "USD"): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return iso; }
}

function addrBlock(a: PoAddress | null | undefined): string {
  if (!a) return "<em>—</em>";
  const lines: string[] = [];
  if (a.name) lines.push(`<strong>${esc(a.name)}</strong>`);
  const street = a.line1 || a.street;
  if (street) lines.push(esc(street));
  if (a.line2) lines.push(esc(a.line2));
  if (a.address && !street) lines.push(esc(a.address));
  const csz = [a.city, a.state, a.zip].filter(Boolean).join(", ");
  if (csz) lines.push(esc(csz));
  if (a.country && a.country !== "United States" && a.country !== "US") lines.push(esc(a.country));
  if (a.phone) lines.push(`<span class="muted">Tel: ${esc(a.phone)}</span>`);
  if (a.email) lines.push(`<span class="muted">${esc(a.email)}</span>`);
  return lines.join("<br>");
}

export function buildPoHtml(data: PoData): string {
  const logo = data.logoDataUrl;
  const cur = data.currency || "USD";
  const subtotal = data.subtotal ?? data.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const tax = data.tax_total ?? 0;
  const total = data.total ?? subtotal + tax;

  const linesHtml = data.lines.length
    ? data.lines.map((l, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="center muted">${i + 1}</td>
        <td><code>${esc(l.sku)}</code></td>
        <td>${esc(l.description)}</td>
        <td class="center">${l.quantity}</td>
        <td class="right">${money(l.unit_price, cur)}</td>
        <td class="right bold">${money(l.quantity * l.unit_price, cur)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="center muted" style="padding:24px">No line items</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Purchase Order ${esc(data.po_number)}</title>
<style>
  @page { margin: 0; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5px; color: #1a1a2e; background: #fff;
    padding: 40px 44px 44px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .doc-title { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; line-height: 1; margin-bottom: 3px; }
  .doc-sub { font-size: 9.5px; font-weight: 500; color: #94a3b8; letter-spacing: 1.5px; text-transform: uppercase; }
  .logo-wrap { text-align: right; }
  .logo-wrap img { max-height: 54px; max-width: 190px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 6px; }
  .logo-text { font-size: 19px; font-weight: 800; letter-spacing: -0.4px; color: #0f172a; }
  .logo-text span { font-weight: 300; color: #64748b; }
  .company-meta { font-size: 9px; color: #94a3b8; line-height: 1.7; text-align: right; }
  .divider { height: 2px; background: linear-gradient(to right, #0f172a 0%, #3b82f6 40%, #e2e8f0 100%); margin-bottom: 22px; border-radius: 1px; }
  .meta-row { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
  .chip { display: flex; flex-direction: column; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; min-width: 110px; }
  .chip-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; margin-bottom: 2px; }
  .chip-value { font-size: 12px; font-weight: 700; color: #0f172a; }
  .chip.accent { background: #eff6ff; border-color: #bfdbfe; }
  .chip.accent .chip-value { color: #1d4ed8; }
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
  .addr-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; background: #fafbfc; }
  .addr-card h3 { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; margin-bottom: 7px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }
  .addr-card p { font-size: 10.5px; line-height: 1.65; color: #334155; }
  .table-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead tr { background: #0f172a; }
  thead th { padding: 9px 10px; text-align: left; font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #cbd5e1; }
  thead th.center { text-align: center; }
  thead th.right { text-align: right; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr.even { background: #f8fafc; }
  tbody td { padding: 9px 10px; vertical-align: top; color: #334155; }
  tbody td.center { text-align: center; }
  tbody td.right { text-align: right; }
  tbody td.bold { font-weight: 700; color: #0f172a; }
  tbody td.muted { color: #94a3b8; }
  code { font-family: 'SF Mono','Fira Code',Consolas,monospace; font-size: 9.5px; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; color: #475569; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 22px; }
  .totals-box { width: 260px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 10.5px; border-bottom: 1px solid #f1f5f9; color: #475569; }
  .totals-row:last-child { border-bottom: none; background: #0f172a; color: #fff; padding: 10px 14px; font-size: 12px; font-weight: 700; }
  .totals-row span:last-child { font-weight: 600; }
  .notes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .notes-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 11px 14px; background: #fafbfc; }
  .notes-box h4 { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; margin-bottom: 5px; }
  .notes-box p { font-size: 9.5px; color: #475569; line-height: 1.65; }
  .footer-bar { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
  .footer-bar span { font-size: 8.5px; color: #cbd5e1; }
  .muted { color: #94a3b8; }
  .bold { font-weight: 700; }
  .center { text-align: center; }
  .right { text-align: right; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="doc-title">Purchase Order</div>
    <div class="doc-sub">Vendor Copy &nbsp;·&nbsp; DocFlow</div>
  </div>
  <div class="logo-wrap">
    ${logo ? `<img src="${logo}" alt="DocFlow" />` : `<div class="logo-text">Doc<span>Flow</span></div>`}
    <div class="company-meta">123 Example St, Suite 100, City, ST 00000<br>sales@example.com &nbsp;·&nbsp; +1 (000) 000-0000</div>
  </div>
</div>
<div class="divider"></div>
<div class="meta-row">
  <div class="chip accent"><span class="chip-label">PO Number</span><span class="chip-value">${esc(data.po_number) || "—"}</span></div>
  <div class="chip"><span class="chip-label">Date</span><span class="chip-value">${fmtDate(data.po_date)}</span></div>
  ${data.odoo_so_name ? `<div class="chip"><span class="chip-label">Sales Order</span><span class="chip-value">${esc(data.odoo_so_name)}</span></div>` : ""}
  ${data.currency ? `<div class="chip"><span class="chip-label">Currency</span><span class="chip-value">${esc(data.currency)}</span></div>` : ""}
  ${data.providerName ? `<div class="chip"><span class="chip-label">Customer</span><span class="chip-value">${esc(data.providerName)}</span></div>` : ""}
</div>
<div class="addr-grid">
  <div class="addr-card"><h3>Buyer / Bill to</h3><p>${addrBlock(data.buyer || data.billing_address)}</p></div>
  <div class="addr-card"><h3>Ship to</h3><p>${addrBlock(data.shipping_address)}</p></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr>
      <th style="width:28px" class="center">#</th>
      <th style="width:88px">SKU</th>
      <th>Description</th>
      <th style="width:48px" class="center">Qty</th>
      <th style="width:88px" class="right">Unit Price</th>
      <th style="width:88px" class="right">Total</th>
    </tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>
</div>
<div class="totals-wrap">
  <div class="totals-box">
    <div class="totals-row"><span>Subtotal</span><span>${money(subtotal, cur)}</span></div>
    <div class="totals-row"><span>Tax</span><span>${money(tax, cur)}</span></div>
    <div class="totals-row"><span>TOTAL</span><span>${money(total, cur)}</span></div>
  </div>
</div>
${(data.payment_terms || data.notes) ? `
<div class="notes-grid">
  ${data.payment_terms ? `<div class="notes-box"><h4>Payment Terms</h4><p>${esc(data.payment_terms)}</p></div>` : ""}
  ${data.notes ? `<div class="notes-box"><h4>Notes / Instructions</h4><p>${esc(data.notes)}</p></div>` : ""}
</div>` : ""}
<div class="footer-bar">
  <span>Generated by DocFlow · AI Document Processing · DocFlow</span>
  <span>PO ${esc(data.po_number)} · ${new Date().toLocaleDateString("en-US")}</span>
</div>
</body>
</html>`;
}
