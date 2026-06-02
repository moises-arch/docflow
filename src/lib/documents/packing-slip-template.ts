// Premium Packing Slip HTML template for DocFlow.
// Style matches the reference packing slip with real logo + premium minimalist finish.

export type PackingSlipAddress = {
  name?: string | null;
  line1?: string | null;
  street?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type PackingSlipLine = {
  sku: string | null;
  description: string | null;
  quantity: number;
};

export type PackingSlipData = {
  po_number: string;
  po_date: string | null;
  buyer: PackingSlipAddress | null;
  shipping_address: PackingSlipAddress | null;
  notes: string | null;
  lines: PackingSlipLine[];
  logoDataUrl?: string | null;
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return iso; }
}

function addrBlock(a: PackingSlipAddress | null | undefined): string {
  if (!a) return "<em>—</em>";
  const lines: string[] = [];
  if (a.name) lines.push(esc(a.name));
  const street = a.line1 || a.street;
  if (street) lines.push(esc(street));
  if (a.line2) lines.push(esc(a.line2));
  if (a.address && !street) lines.push(esc(a.address));
  const csz = [a.city, a.state, a.zip].filter(Boolean).join(", ");
  if (csz) lines.push(esc(csz));
  if (a.country) lines.push(esc(a.country));
  return lines.join("<br>");
}

function shippingMethod(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/(?:routing|shipping|carrier)[:\s]+([^;,\n]+)/i);
  if (m) return m[1].trim();
  const ups = notes.match(/UPS[^;,\n]*/i);
  if (ups) return ups[0].trim();
  return null;
}

export function buildPackingSlipHtml(data: PackingSlipData): string {
  const logo = data.logoDataUrl;
  const shipping = shippingMethod(data.notes);
  const totalItems = data.lines.reduce((s, l) => s + l.quantity, 0);

  const linesHtml = data.lines.length
    ? data.lines.map((l, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>
          <div class="item-name">${esc(l.description) || "—"}</div>
          ${l.sku ? `<div class="item-sku">${esc(l.sku)}</div>` : ""}
        </td>
        <td class="qty-cell">${l.quantity} of ${totalItems}</td>
      </tr>`).join("")
    : `<tr><td colspan="2" class="center muted" style="padding:20px">No items</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Packing Slip ${esc(data.po_number)}</title>
<style>
  @page { margin: 0; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px; color: #111827; background: #fff;
    padding: 40px 44px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
  .slip-title { font-size: 34px; font-weight: 900; letter-spacing: -1px; color: #111827; line-height: 1; }
  .order-num { font-size: 13px; font-weight: 600; color: #6b7280; margin-top: 5px; }
  .company-block { text-align: right; }
  .company-block img { max-height: 58px; max-width: 200px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 7px; }
  .logo-text { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; color: #111827; margin-bottom: 6px; }
  .logo-text span { font-weight: 300; color: #6b7280; }
  .company-meta { font-size: 9.5px; color: #9ca3af; line-height: 1.8; }
  .divider { height: 1px; background: #d1d5db; margin: 18px 0; }
  .meta-table { width: 100%; margin-bottom: 18px; }
  .meta-table td { font-size: 11px; padding: 2.5px 0; color: #374151; }
  .meta-table td:first-child { font-weight: 700; width: 110px; color: #111827; }
  .addr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
  .addr-section h3 { font-size: 11px; font-weight: 800; color: #111827; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #111827; }
  .addr-section p { font-size: 11px; color: #374151; line-height: 1.7; }
  .table-wrap { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #111827; }
  thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; color: #fff; letter-spacing: 0.3px; }
  thead th:last-child { text-align: right; width: 80px; }
  tbody tr { border-bottom: 1px solid #f3f4f6; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr.even { background: #f9fafb; }
  tbody td { padding: 11px 14px; vertical-align: top; }
  .item-name { font-weight: 600; font-size: 11px; color: #111827; line-height: 1.4; }
  .item-sku { font-size: 9.5px; color: #9ca3af; margin-top: 2px; font-family: 'SF Mono',Consolas,monospace; }
  .qty-cell { text-align: right; font-weight: 600; font-size: 11px; color: #374151; }
  .footer { text-align: center; margin-top: 6px; }
  .footer-main { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 3px; }
  .footer-sub { font-size: 10px; color: #9ca3af; }
  .footer-bar { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
  .footer-bar span { font-size: 8.5px; color: #d1d5db; }
  .muted { color: #9ca3af; }
  .center { text-align: center; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="slip-title">Packing Slip</div>
    <div class="order-num">Order #${esc(data.po_number)}</div>
  </div>
  <div class="company-block">
    ${logo ? `<img src="${logo}" alt="DocFlow" />` : `<div class="logo-text">Doc<span>Flow</span></div>`}
    <div class="company-meta">123 Example St, Suite 100<br>City, ST 00000, USA<br>sales@example.com &nbsp;·&nbsp; www.example.com<br>+1 (000) 000-0000</div>
  </div>
</div>
<div class="divider"></div>
<table class="meta-table">
  <tr><td>Order Date</td><td>${fmtDate(data.po_date)}</td></tr>
  ${shipping ? `<tr><td>Shipping</td><td>${esc(shipping)}</td></tr>` : ""}
  <tr><td>Total items</td><td>${data.lines.length} SKU${data.lines.length !== 1 ? "s" : ""} &nbsp;·&nbsp; ${totalItems} unit${totalItems !== 1 ? "s" : ""}</td></tr>
</table>
<div class="divider"></div>
<div class="addr-grid">
  <div class="addr-section"><h3>Bill to</h3><p>${addrBlock(data.buyer)}</p></div>
  <div class="addr-section"><h3>Ship to</h3><p>${addrBlock(data.shipping_address)}</p></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr><th>Item Description</th><th>Qty</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>
</div>
<div class="footer">
  <div class="footer-main">Thank you for your order.</div>
  <div class="footer-sub">Questions? Contact us at sales@example.com</div>
</div>
<div class="footer-bar">
  <span>Generated by DocFlow · AI Document Processing · DocFlow</span>
  <span>PO ${esc(data.po_number)} · ${new Date().toLocaleDateString("en-US")}</span>
</div>
</body>
</html>`;
}
