// Renderiza el template con datos de ejemplo para preview en la UI.
// POST con { subject?, intro? } — usa los valores enviados (o los guardados / defaults
// si no vienen) para que el usuario vea el resultado antes de guardar.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No tenant" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    subject?: string;
    intro?: string;
  };

  const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
  const rawSubject = (body.subject?.trim()) || defaults.subject;
  const rawIntro = (body.intro?.trim()) || defaults.intro;

  let html: string;

  if (type === "order_approved") {
    const sampleVars = {
      poNumber: "9260260",
      partner: "The Home Depot Inc",
      total: "USD 4,250.00",
      odooSoName: "S09487",
    };
    const subject = interpolateOrderVars(rawSubject, sampleVars);
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
  } else {
    // daily_digest
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
    const subject = interpolateDigestVars(rawSubject, sampleData);
    const intro = interpolateDigestVars(rawIntro, sampleData);

    const rendered = renderDailyDigestEmail({
      ...sampleData,
      subject,
      intro,
      dashboardUrl: "https://app.example.com/dashboard",
    });
    html = rendered.html;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
