import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function tenantContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id)
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  return {
    supabase: supabase as unknown as DynamicSupabaseClient,
    user,
    tenantId: membership.tenant_id,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await tenantContext();
  if ("error" in context) return context.error;

  const { id: documentId } = await params;
  const providerId = cleanText(new URL(req.url).searchParams.get("provider_id"), 80);

  if (!providerId) {
    return NextResponse.json({ error: "provider_id is required" }, { status: 422 });
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  const { data: document } = await context.supabase
    .from<{ id: string }>("documents")
    .select("id")
    .eq("id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: items, error } = await service
    .from("provider_field_annotations")
    .select("id, target_field_key, source_hint, normalized_text, selection_meta, created_at")
    .eq("tenant_id", context.tenantId)
    .eq("provider_id", providerId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch annotations" }, { status: 500 });
  }

  return NextResponse.json({ items: items ?? [] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await tenantContext();
  if ("error" in context) return context.error;

  const { id: documentId } = await params;

  let body: { provider_id?: unknown; target_field_key?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const providerId = cleanText(body.provider_id, 80);
  const targetFieldKey = cleanText(body.target_field_key, 120);

  if (!providerId || !targetFieldKey) {
    return NextResponse.json(
      { error: "provider_id and target_field_key are required" },
      { status: 422 },
    );
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  const { data: document } = await context.supabase
    .from<{ id: string }>("documents")
    .select("id")
    .eq("id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { error } = await service
    .from("provider_field_annotations")
    .delete()
    .eq("tenant_id", context.tenantId)
    .eq("provider_id", providerId)
    .eq("target_field_key", targetFieldKey);

  if (error) {
    return NextResponse.json({ error: "Failed to delete annotation" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await tenantContext();
  if ("error" in context) return context.error;

  const { id: documentId } = await params;

  let body: {
    provider_id?: unknown;
    target_field_key?: unknown;
    source_hint?: unknown;
    normalized_text?: unknown;
    selection_meta?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const providerId = cleanText(body.provider_id, 80);
  const targetFieldKey = cleanText(body.target_field_key, 120);
  const sourceHint = cleanText(body.source_hint, 300) || null;
  const normalizedText = cleanText(body.normalized_text, 2000) || null;
  const selectionMeta =
    body.selection_meta &&
    typeof body.selection_meta === "object" &&
    !Array.isArray(body.selection_meta)
      ? body.selection_meta
      : {};

  if (!providerId || !targetFieldKey) {
    return NextResponse.json(
      { error: "provider_id and target_field_key are required" },
      { status: 422 },
    );
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  const { data: document } = await service
    .from<{ id: string }>("documents")
    .select("id")
    .eq("id", documentId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { error } = await service.from("provider_field_annotations").upsert(
    {
      tenant_id: context.tenantId,
      provider_id: providerId,
      target_field_key: targetFieldKey,
      source_hint: sourceHint,
      normalized_text: normalizedText,
      selection_meta: selectionMeta,
      created_by: context.user.id,
    },
    { onConflict: "tenant_id,provider_id,target_field_key" },
  );

  if (error) {
    return NextResponse.json({ error: "Failed to save field annotation" }, { status: 500 });
  }

  // Auto-sync to provider_field_mappings so the structural mapping stays in sync
  if (sourceHint) {
    const { data: draft } = await service
      .from<{ review_profile_id: string | null }>("order_drafts")
      .select("review_profile_id")
      .eq("document_id", documentId)
      .eq("tenant_id", context.tenantId)
      .maybeSingle();

    if (draft) {
      // Find target_field by key — prefer profile-specific, fall back to global
      const { data: allMatches } = await service
        .from<{ id: string; review_profile_id: string | null }>("target_fields")
        .select("id, review_profile_id")
        .eq("tenant_id", context.tenantId)
        .eq("key", targetFieldKey);

      const matches = (allMatches ?? []) as { id: string; review_profile_id: string | null }[];
      const targetField =
        matches.find((f) => f.review_profile_id === draft.review_profile_id) ??
        matches.find((f) => !f.review_profile_id) ??
        matches[0];

      if (targetField) {
        const sourceKey = sourceHint
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 100);

        await service.from("provider_field_mappings").upsert(
          {
            tenant_id: context.tenantId,
            provider_id: providerId,
            target_field_id: targetField.id,
            source_field_key: sourceKey,
            source_field_label: sourceHint,
            active: true,
          },
          { onConflict: "provider_id,target_field_id" },
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
