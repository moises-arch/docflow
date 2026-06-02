// Session-authenticated manual dispatch for Cleo orders.
// Accepts a cleo_message_id, checks if already downloaded, and runs the
// Playwright job to fetch the PDF from webedi.cleo.com.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { runCleoJob } from "@/lib/cleo/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  let body: { message_id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  if (!messageId) {
    return NextResponse.json({ error: "message_id requerido" }, { status: 422 });
  }

  const result = await runCleoJob({
    tenant_id: tenantId,
    inbound_email_id: null,
    cleo_message_id: messageId,
    cleo_reference: "",
    cleo_batch_id: "",
    trading_partner: null,
    subject: "manual-rescue",
    from_email: "manual@docflow",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
