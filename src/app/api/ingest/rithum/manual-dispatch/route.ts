// Despacha manualmente una orden Rithum por PO Number, sin requerir que esté
// en el bucket "no-activity". Útil cuando el email trigger falló o la orden
// cambió de estado antes de que el cron la capturara.
import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { runRithumJob } from "@/lib/rithum/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function partnerPid(partner: string): "thehomedepot" | "thdso" | "walmartmp" | null {
  const m = partner.toLowerCase();
  if (m.includes("home depot special")) return "thdso";
  if (m.includes("home depot")) return "thehomedepot";
  if (m.includes("walmart")) return "walmartmp";
  return null;
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  let body: { po_number?: unknown; partner?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const poNumber = typeof body.po_number === "string" ? body.po_number.trim() : "";
  if (!poNumber) return NextResponse.json({ error: "po_number requerido" }, { status: 422 });

  const partner =
    typeof body.partner === "string" && body.partner.trim()
      ? body.partner.trim()
      : "The Home Depot Inc";

  const result = await runRithumJob({
    tenant_id: tenantId,
    inbound_email_id: null,
    rithum_order_number: poNumber,
    rithum_partner: partner,
    rithum_partner_pid: partnerPid(partner),
    rithum_order_date: null,
    subject: "manual-dispatch",
    from_email: "manual@docflow",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
