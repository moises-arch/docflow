import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { InboxClient, type DocumentRow } from "@/components/app/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();
  const locale = await getLocale();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  // ── Resolve tenant ─────────────────────────────────────────────────────────
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    redirect(`/${locale}/select-tenant`);
  }

  const tenantId = membership.tenant_id;

  // ── Initial document list ─────────────────────────────────────────────────
  const { data: rows } = await supabase
    .from("documents")
    .select("id, doc_number, original_name, state, page_count, created_at, updated_at, mime_type, size_bytes, meta, source_channel, source_meta, last_error")
    .eq("tenant_id", tenantId)
    .in("state", ["uploaded", "processing", "needs_review", "failed_processing"])
    .order("created_at", { ascending: false })
    .limit(100);

  const documents: DocumentRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    doc_number: (r as Record<string, unknown>).doc_number as string | null ?? null,
    original_name: r.original_name,
    state: r.state,
    page_count: r.page_count,
    created_at: r.created_at,
    updated_at: (r as Record<string, unknown>).updated_at as string | null ?? null,
    credit_cost: null,
    mime_type: r.mime_type ?? null,
    size_bytes: r.size_bytes ?? null,
    source_channel:
      ((r as Record<string, unknown>).source_channel as DocumentRow["source_channel"]) ?? null,
    meta: (r as Record<string, unknown>).meta as DocumentRow["meta"] ?? null,
    source_meta:
      ((r as Record<string, unknown>).source_meta as DocumentRow["source_meta"]) ?? null,
    last_error: (r as Record<string, unknown>).last_error as string | null ?? null,
  }));

  return <InboxClient initialDocuments={documents} tenantId={tenantId} />;
}
