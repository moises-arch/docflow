// Buy Box snapshot — daily. Walmart's Buy Box API is async (request →
// poll for READY → download CSV). We persist results into walmart_buybox_snapshots.

import { createServiceClient } from "@/lib/supabase/service";
import {
  requestBuyBoxReport,
  pollReport,
  downloadReport,
} from "@/lib/walmart/api/reports";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Parses the Buy Box CSV response (Walmart format) into snapshot rows.
function parseBuyBoxCsv(csv: string): Array<{
  walmart_item_id: string;
  is_winning: boolean;
  our_price: number | null;
  buybox_price: number | null;
  competitor_count: number | null;
}> {
  const lines = csv.split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out: Array<{
    walmart_item_id: string;
    is_winning: boolean;
    our_price: number | null;
    buybox_price: number | null;
    competitor_count: number | null;
  }> = [];

  // Walmart's column names (best-effort mapping; we accept several known variants)
  const colItemId =
    headers.indexOf("itemid") >= 0 ? headers.indexOf("itemid") : headers.indexOf("item_id");
  const colSku = headers.indexOf("sku");
  const colWinning =
    headers.indexOf("buybox_winning") >= 0
      ? headers.indexOf("buybox_winning")
      : headers.indexOf("is_buybox_winning");
  const colOurPrice =
    headers.indexOf("seller_price") >= 0
      ? headers.indexOf("seller_price")
      : headers.indexOf("your_price");
  const colBbPrice =
    headers.indexOf("buybox_price") >= 0
      ? headers.indexOf("buybox_price")
      : headers.indexOf("buy_box_price");
  const colCompetitors =
    headers.indexOf("competitor_count") >= 0
      ? headers.indexOf("competitor_count")
      : headers.indexOf("competitors");

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((v) => v.trim());
    if (row.length < 2) continue;
    const itemId = colItemId >= 0 ? row[colItemId] : colSku >= 0 ? row[colSku] : null;
    if (!itemId) continue;
    out.push({
      walmart_item_id: itemId,
      is_winning: colWinning >= 0 ? /true|yes|won|y/i.test(row[colWinning] ?? "") : false,
      our_price: colOurPrice >= 0 ? Number(row[colOurPrice]) || null : null,
      buybox_price: colBbPrice >= 0 ? Number(row[colBbPrice]) || null : null,
      competitor_count:
        colCompetitors >= 0 ? Number(row[colCompetitors]) || null : null,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const correlationId = randomUUID();
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id")
    .limit(1)
    .returns<Array<{ id: string }>>();
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) return NextResponse.json({ error: "no_tenant" }, { status: 422 });

  try {
    const request = await requestBuyBoxReport(correlationId);
    const status = await pollReport(request.requestId, {
      maxPolls: 25,
      intervalMs: 10_000,
      correlationId,
    });
    if (!status.reportUrl) {
      throw new Error("buybox_report_no_url");
    }
    const csv = await downloadReport(status.reportUrl);
    const rows = parseBuyBoxCsv(csv);

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, reason: "no_rows_in_report" });
    }

    // Bulk insert snapshots
    const insertRows = rows.map((r) => ({
      tenant_id: tenantId,
      walmart_item_id: r.walmart_item_id,
      is_winning: r.is_winning,
      our_price: r.our_price,
      buybox_price: r.buybox_price,
      competitor_count: r.competitor_count,
    }));

    // Insert in batches of 500
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += 500) {
      const batch = insertRows.slice(i, i + 500);
      const { error } = await svc.from("walmart_buybox_snapshots").insert(batch);
      if (!error) inserted += batch.length;
    }

    // Also update walmart_items with current buybox status
    for (const r of rows) {
      await (
        svc.from("walmart_items") as unknown as {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => Promise<{ error: unknown }>;
            };
          };
        }
      )
        .update({
          buybox_winning: r.is_winning,
          buybox_winner_price: r.buybox_price,
        })
        .eq("tenant_id", tenantId)
        .eq("walmart_item_id", r.walmart_item_id);
    }

    await svc.from("walmart_smoke_runs").insert({
      tenant_id: tenantId,
      ok: true,
      checks: [{ name: "sync_buybox", ok: true, detail: `inserted=${inserted}` }],
    });

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await svc.from("walmart_smoke_runs").insert({
      tenant_id: tenantId,
      ok: false,
      checks: [{ name: "sync_buybox", ok: false, detail: reason.slice(0, 200) }],
    });
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
}
