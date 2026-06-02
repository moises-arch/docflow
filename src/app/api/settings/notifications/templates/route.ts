import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEFAULTS: Record<string, { subject: string; intro: string }> = {
  order_approved: {
    subject: "{{partner}} · PO {{po_number}} ya en Odoo",
    intro: "Orden recibida, validada y sincronizada como sale order en Odoo. Confirmá el detalle abajo o abrila directo en el ERP.",
  },
  daily_digest: {
    subject: "DocFlow · {{period}} — {{total_count}} docs ({{approval_rate}}% aprobadas)",
    intro: "Resumen del período: documentos procesados, estado de sincronización con Odoo y alertas pendientes.",
  },
};

export { DEFAULTS as EMAIL_TEMPLATE_DEFAULTS };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id").eq("user_id", user.id).single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "No tenant" }, { status: 403 });

  const svc = createServiceClient();

  // Upsert defaults si no existen todavía
  for (const [type, def] of Object.entries(DEFAULTS)) {
    await svc.from("email_templates").upsert(
      { tenant_id: membership.tenant_id, type, subject: def.subject, intro: def.intro },
      { onConflict: "tenant_id,type", ignoreDuplicates: true },
    );
  }

  const { data } = await svc
    .from("email_templates")
    .select("id, type, subject, intro, updated_at")
    .eq("tenant_id", membership.tenant_id)
    .order("type", { ascending: true });

  return NextResponse.json({ templates: data ?? [] });
}
