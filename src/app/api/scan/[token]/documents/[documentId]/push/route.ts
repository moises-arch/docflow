// QR mobile "Generar Odoo SO" — triggers the bypass push for a document's
// order_draft. Token-scoped: tenant must match the token's tenant.
//
// Resolves the draft from documentId, then calls the same /api/order-drafts/[id]/push
// internally via service-role to inherit identical bypass semantics.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { verifyScanToken } from "@/lib/scan-token";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await params;
  const payload = verifyScanToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  let forceDuplicatePo = false;
  try {
    const body = (await req.json().catch(() => null)) as
      | { force_duplicate_po?: unknown }
      | null;
    if (body?.force_duplicate_po === true) forceDuplicatePo = true;
  } catch {
    /* body optional */
  }

  const service = createServiceClient();

  // Find the draft for this document scoped to the token's tenant.
  const { data: draft } = await service
    .from("order_drafts")
    .select("id")
    .eq("tenant_id", payload.tenant_id)
    .eq("document_id", documentId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json(
      { error: "no_draft", detail: "No hay draft para este documento todavía" },
      { status: 404 },
    );
  }

  // Build absolute URL to the internal push endpoint. We must call it with
  // service-role so it auths as a server call (otherwise it'd require cookie).
  const baseUrl =
    req.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.example.com";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const pushRes = await fetch(`${baseUrl}/api/order-drafts/${(draft as { id: string }).id}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      force_duplicate_po: forceDuplicatePo,
      actor_user_id: payload.user_id,
    }),
  });

  const result = (await pushRes.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(result, { status: pushRes.status });
}
