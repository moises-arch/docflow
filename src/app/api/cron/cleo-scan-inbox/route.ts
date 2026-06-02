// Cron: escanea el inbox del portal Cleo WebEDI cada 30 min.
// Auth: Vercel cron bearer CRON_SECRET (mismo patrón que otros crons del proyecto).
// Flujo:
//   1. Obtener tenant
//   2. runCleoPortalScan: browser → login → inbox → filtrar 850s nuevas → despachar jobs
//   3. Devolver JSON con resultado del scan

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runCleoPortalScan } from "@/lib/cleo/portal-scan";

export const runtime = "nodejs";
export const maxDuration = 300;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type TenantRow = { id: string };

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolver tenant: buscar el tenant activo con credenciales Cleo configuradas
  const svc = createServiceClient();
  const { data: tenantRows, error: tenantError } = await (
    svc as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          not: (col: string, op: string, val: unknown) => {
            limit: (n: number) => Promise<{ data: TenantRow[] | null; error: unknown }>;
          };
        };
      };
    }
  )
    .from("tenants")
    .select("id")
    .not("settings->cleo_username", "is", null)
    .limit(1);

  if (tenantError || !tenantRows || tenantRows.length === 0) {
    // Si no hay tenants con Cleo configurado, buscamos el primero disponible
    // (las credenciales vienen de env vars CLEO_USERNAME/CLEO_PASSWORD)
    const { data: fallback } = await svc
      .from("tenants" as "documents")
      .select("id")
      .limit(1)
      .maybeSingle();
    const row = fallback as TenantRow | null;
    if (!row?.id) {
      return NextResponse.json({ error: "tenant_not_found" }, { status: 500 });
    }

    const result = await runCleoPortalScan(row.id).catch((err) => ({
      ok: false,
      found: 0,
      dispatched: 0,
      skipped: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    }));

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  const tenantId = tenantRows[0].id;
  const result = await runCleoPortalScan(tenantId).catch((err) => ({
    ok: false,
    found: 0,
    dispatched: 0,
    skipped: 0,
    errors: [err instanceof Error ? err.message : String(err)],
  }));

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
