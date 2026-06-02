import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { NextResponse } from "next/server";

type CostRow = {
  id: string;
  original_name: string;
  state: string;
  created_at: string;
  cost_usd: number | null;
};

function parseCostUsd(modelMeta: Json): number | null {
  if (!modelMeta || typeof modelMeta !== "object" || Array.isArray(modelMeta)) return null;
  const meta = modelMeta as Record<string, unknown>;
  const actual = Number(meta.ai_cost_usd_actual);
  if (Number.isFinite(actual) && actual > 0) return actual;
  const effective = Number(meta.effective_extraction_cost_usd);
  if (Number.isFinite(effective) && effective > 0) return effective;
  return null;
}

export async function GET(_req?: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const { data: documents } = await supabase
    .from("documents")
    .select("id, original_name, state, created_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const documentIds = (documents ?? []).map((doc) => doc.id);
  if (!documentIds.length) {
    return NextResponse.json({ items: [] as CostRow[] });
  }

  const { data: extractions } = await supabase
    .from("extractions")
    .select("document_id, model_meta")
    .eq("tenant_id", membership.tenant_id)
    .eq("current", true)
    .in("document_id", documentIds);

  const extractionByDocument = new Map<string, Json>();
  for (const extraction of extractions ?? []) {
    extractionByDocument.set(extraction.document_id, extraction.model_meta);
  }

  const items: CostRow[] = (documents ?? []).map((document) => ({
    id: document.id,
    original_name: document.original_name,
    state: document.state,
    created_at: document.created_at,
    cost_usd: parseCostUsd(extractionByDocument.get(document.id) ?? null),
  }));

  return NextResponse.json({ items });
}
