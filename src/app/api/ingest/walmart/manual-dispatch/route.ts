// Session-authenticated endpoint to process a Walmart PO manually.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  const { tenantId } = ctx;

  let body: { po_number?: string };
  try {
    body = (await req.json()) as { po_number?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const poNumber = body.po_number?.trim();
  if (!poNumber) {
    return NextResponse.json({ ok: false, reason: "missing_po_number" }, { status: 422 });
  }

  const internalToken = process.env.INTAKE_WALMART_INTERNAL_TOKEN;
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL;
  if (!internalToken || !baseUrl) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    const resp = await fetch(`${baseUrl}/api/ingest/walmart/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-walmart-internal-token": internalToken,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        walmart_po_id: poNumber,
        source: "manual",
      }),
    });

    const result = await resp.json().catch(() => null);

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, reason: result?.reason ?? result?.error ?? String(resp.status) },
        { status: resp.status },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
}
