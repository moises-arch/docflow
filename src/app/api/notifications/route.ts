import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Notification = {
  id: string;
  source: string;
  source_id: string | null;
  severity: string;
  title: string;
  description: string | null;
  href: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

const VALID_SEVERITIES = new Set(["info", "success", "warning", "error"]);
const VALID_SOURCES = new Set(["workflow_event", "odoo_sync", "healthcheck", "admin"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const severitiesParam = url.searchParams.get("severity");
  const sourcesParam = url.searchParams.get("source");
  const before = url.searchParams.get("before");
  const search = url.searchParams.get("search");

  const severities = severitiesParam
    ? severitiesParam.split(",").filter((s) => VALID_SEVERITIES.has(s))
    : null;
  const sources = sourcesParam
    ? sourcesParam.split(",").filter((s) => VALID_SOURCES.has(s))
    : null;

  const service = createServiceClient();

  // Cargar notifications + left join a reads de este usuario.
  let query = service
    .from("notifications")
    .select(`
      id, source, source_id, severity, title, description, href, meta, created_at,
      notification_reads!left(read_at, user_id)
    `)
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);
  if (severities && severities.length) query = query.in("severity", severities);
  if (sources && sources.length) query = query.in("source", sources);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load notifications", detail: error.message }, { status: 500 });
  }

  type RawRow = Omit<Notification, "read_at"> & {
    notification_reads: Array<{ read_at: string; user_id: string }> | null;
  };

  const items: Notification[] = ((data as unknown as RawRow[]) ?? []).map((row) => {
    const ownRead = row.notification_reads?.find((r) => r.user_id === user.id);
    return {
      id: row.id,
      source: row.source,
      source_id: row.source_id,
      severity: row.severity,
      title: row.title,
      description: row.description,
      href: row.href,
      meta: row.meta,
      created_at: row.created_at,
      read_at: ownRead?.read_at ?? null,
    };
  });

  const filtered = unreadOnly ? items.filter((n) => n.read_at === null) : items;
  const cursor = filtered.length === limit ? filtered[filtered.length - 1].created_at : null;

  return NextResponse.json({ items: filtered, cursor });
}
