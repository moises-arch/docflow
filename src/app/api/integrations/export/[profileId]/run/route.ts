export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getIntegrationContext } from "@/app/api/integrations/_lib";

export async function POST(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const context = await getIntegrationContext({ ownerOnly: true });
  if ("error" in context) return context.error;

  const { profileId } = await params;

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderDraftId = String(payload.order_draft_id ?? "").trim();
  if (!orderDraftId) {
    return NextResponse.json({ error: "order_draft_id is required" }, { status: 422 });
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/odoo-export`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenant_id: context.tenantId,
      export_profile_id: profileId,
      order_draft_id: orderDraftId,
    }),
  });

  const body = (await edgeRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!edgeRes.ok) {
    return NextResponse.json(
      { error: body.error ?? "Export failed", detail: body.detail },
      { status: edgeRes.status },
    );
  }

  return NextResponse.json(body);
}
