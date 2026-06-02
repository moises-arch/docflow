// Envío de prueba — manda el email real al destinatario indicado en el body
// (default: el email del usuario logueado). Usa el transporte normal (Graph/Mailgun)
// para que se vea exactamente como lo recibirán los destinatarios reales.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderOrderApprovedEmail, interpolateOrderVars } from "@/lib/email/templates/order-approved";
import { renderDailyDigestEmail, interpolateDigestVars } from "@/lib/email/templates/daily-digest";
import { EMAIL_TEMPLATE_DEFAULTS } from "../../route";
import { ERP_BASE_URL } from "@/lib/erp-url";

const VALID_TYPES = new Set(["order_approved", "daily_digest"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 422 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    subject?: string;
    intro?: string;
    to?: string;
  };

  // Destinatario: el email indicado o el del usuario logueado
  const recipient = (body.to?.trim() || user.email)?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: "Email destinatario inválido" }, { status: 422 });
  }

  const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
  const rawSubject = (body.subject?.trim()) || defaults.subject;
  const rawIntro = (body.intro?.trim()) || defaults.intro;

  let html: string;
  let text: string;
  let subject: string;

  if (type === "order_approved") {
    const sampleVars = {
      poNumber: "TEST-9260260",
      partner: "The Home Depot Inc (PRUEBA)",
      total: "USD 4,250.00",
      odooSoName: "TEST-S09487",
    };
    subject = `[PRUEBA] ${interpolateOrderVars(rawSubject, sampleVars)}`;
    const intro = interpolateOrderVars(rawIntro, sampleVars);

    const rendered = renderOrderApprovedEmail({
      ...sampleVars,
      currency: "USD",
      approvedAt: new Date().toISOString(),
      odooSoUrl: `${ERP_BASE_URL}/web#id=9487&model=sale.order`,
      subject,
      intro,
      lineCount: 7,
    });
    html = rendered.html;
    text = rendered.text;
  } else {
    const sampleData = {
      period: "8:00 AM – 3:00 PM, 21 mayo 2026",
      approvedCount: 12,
      pendingCount: 3,
      failedCount: 1,
      errors: [
        {
          title: "Walmart healthcheck falló",
          description: "Token endpoint returned 503",
          created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        {
          title: "Sync de productos falló",
          description: "Odoo connection timeout",
          created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        },
      ],
    };
    subject = `[PRUEBA] ${interpolateDigestVars(rawSubject, sampleData)}`;
    const intro = interpolateDigestVars(rawIntro, sampleData);

    const rendered = renderDailyDigestEmail({
      ...sampleData,
      subject,
      intro,
      dashboardUrl: "https://app.example.com/dashboard",
    });
    html = rendered.html;
    text = rendered.text;
  }

  // Send vía transporte normal (Graph o Mailgun)
  const result = await sendEmail({ to: recipient, subject, html, text });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "Email no se pudo entregar",
        via: result.via,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    to: recipient,
    via: result.via,
    delivered: result.delivered,
  });
}
