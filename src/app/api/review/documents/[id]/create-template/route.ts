import type { DynamicSupabaseClient } from "@/app/api/settings/providers/_lib";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cleanText(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  let body: { name?: unknown; code?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const service = createServiceClient() as unknown as DynamicSupabaseClient;

  const { data: document } = await service
    .from<{
      id: string;
      tenant_id: string;
      original_name: string | null;
      provider_id: string | null;
    }>("documents")
    .select("id, tenant_id, original_name, provider_id")
    .eq("id", documentId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: draft } = await service
    .from<{ provider_id: string | null }>("order_drafts")
    .select("provider_id")
    .eq("document_id", documentId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  const existingProviderId = document.provider_id ?? draft?.provider_id ?? null;

  if (existingProviderId) {
    const { data: existingProvider } = await service
      .from<{ id: string; name: string; code: string }>("providers")
      .select("id, name, code")
      .eq("tenant_id", membership.tenant_id)
      .eq("id", existingProviderId)
      .maybeSingle();

    if (existingProvider?.id) {
      await service
        .from("documents")
        .update({ provider_id: existingProvider.id })
        .eq("id", document.id)
        .eq("tenant_id", membership.tenant_id);

      await service
        .from("order_drafts")
        .update({ provider_id: existingProvider.id })
        .eq("document_id", document.id)
        .eq("tenant_id", membership.tenant_id);

      return NextResponse.json({
        ok: true,
        provider_id: existingProvider.id,
        code: existingProvider.code,
        name: existingProvider.name,
        reused: true,
      });
    }
  }

  // Validar nombre explícito. NO usar original_name como fallback porque
  // PDFs llegan con nombres como "4135040025.pdf" que terminan creando
  // providers basura. El frontend debe enviar un nombre real.
  const explicitName = cleanText(body.name, 120);
  if (!explicitName) {
    return NextResponse.json(
      { error: "name_required", message: "Provider name is required" },
      { status: 422 },
    );
  }
  // Rechazar nombres que claramente son filenames (terminan en extensión).
  if (/\.(pdf|jpg|jpeg|png|webp|html?|txt|xlsx?|csv|ods)$/i.test(explicitName)) {
    return NextResponse.json(
      { error: "invalid_name", message: "Provider name cannot be a filename" },
      { status: 422 },
    );
  }
  const baseName = explicitName;
  const code =
    slugify(cleanText(body.code, 64) || baseName) || `provider-${crypto.randomUUID().slice(0, 8)}`;

  const { data: existing } = await service
    .from<{ id: string; code: string }>("providers")
    .select("id, code")
    .eq("tenant_id", membership.tenant_id)
    .eq("code", code)
    .maybeSingle();

  const providerId = existing?.id
    ? existing.id
    : (
        await service
          .from<{ id: string }>("providers")
          .insert({
            tenant_id: membership.tenant_id,
            name: baseName,
            code,
            status: "active",
            email_domains: [],
          })
          .select("id")
          .single()
      ).data?.id;

  if (!providerId) {
    return NextResponse.json({ error: "Failed to create provider template" }, { status: 500 });
  }

  await service
    .from("documents")
    .update({ provider_id: providerId })
    .eq("id", document.id)
    .eq("tenant_id", membership.tenant_id);

  await service
    .from("order_drafts")
    .update({ provider_id: providerId })
    .eq("document_id", document.id)
    .eq("tenant_id", membership.tenant_id);

  return NextResponse.json({ ok: true, provider_id: providerId, code, name: baseName });
}
