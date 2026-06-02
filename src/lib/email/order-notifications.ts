// src/lib/email/order-notifications.ts

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "./send";
import { renderOrderApprovedEmail, interpolateOrderVars } from "./templates/order-approved";

interface OrderApprovedInput {
  tenantId: string;
  draftId: string;
  odooSoId: number;
  odooSoName: string;
}

const DEFAULT_SUBJECT = "{{partner}} · PO {{po_number}} ya en Odoo";
const DEFAULT_INTRO = "Orden recibida, validada y sincronizada como sale order en Odoo. Confirmá el detalle abajo o abrila directo en el ERP.";

/**
 * Envía email de orden aprobada a los destinatarios configurados.
 * Best-effort — no throw. Debe llamarse con void o .catch(console.error).
 */
export async function sendOrderApprovedEmail(input: OrderApprovedInput): Promise<void> {
  const svc = createServiceClient();

  const { data: draft } = await svc
    .from("order_drafts")
    .select("po_number, notes, currency, shipping_address, billing_address, buyer")
    .eq("id", input.draftId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (!draft) return;

  const { data: lines } = await svc
    .from("order_draft_lines")
    .select("line_total")
    .eq("order_draft_id", input.draftId)
    .eq("tenant_id", input.tenantId);

  const total = (lines ?? []).reduce((sum, l) => sum + (l.line_total ?? 0), 0);
  const lineCount = (lines ?? []).length;
  const currency = (draft.currency as string | null) ?? "USD";
  const totalFormatted = `${currency} ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  type BuyerJson = { name?: string } | null;
  const buyer = draft.buyer as BuyerJson;
  const partner = buyer?.name ?? "Proveedor";
  const poNumber = (draft.po_number as string | null) ?? input.draftId.slice(0, 8);

  let odooSoUrl: string | null = null;
  const { data: conn } = await svc
    .from("odoo_connections")
    .select("base_url")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (conn?.base_url) {
    odooSoUrl = `${conn.base_url as string}/web#id=${input.odooSoId}&model=sale.order`;
  }

  const { data: tmpl } = await svc
    .from("email_templates")
    .select("subject, intro")
    .eq("tenant_id", input.tenantId)
    .eq("type", "order_approved")
    .maybeSingle();

  const rawSubject = (tmpl?.subject as string | null) ?? DEFAULT_SUBJECT;
  const rawIntro = (tmpl?.intro as string | null) ?? DEFAULT_INTRO;

  const vars = { poNumber, partner, total: totalFormatted, odooSoName: input.odooSoName };
  const subject = interpolateOrderVars(rawSubject, vars);
  const intro = interpolateOrderVars(rawIntro, vars);

  const { data: recipients } = await svc
    .from("email_recipients")
    .select("email")
    .eq("tenant_id", input.tenantId)
    .eq("active", true)
    .in("type", ["order_approved", "all"]);

  const emails = (recipients ?? []).map((r) => r.email as string);
  if (emails.length === 0) return;

  const { html, text } = renderOrderApprovedEmail({
    poNumber, partner, total: totalFormatted, currency,
    approvedAt: new Date().toISOString(),
    odooSoName: input.odooSoName, odooSoUrl,
    subject, intro, lineCount,
  });

  await sendEmail({ to: emails, subject, html, text });
}
