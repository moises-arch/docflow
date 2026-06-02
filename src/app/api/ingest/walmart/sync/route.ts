// Session-authenticated proxy to Walmart cron endpoints.
// Lets the dashboard force syncs without exposing CRON_SECRET to the client.

import { getTenantContext } from "@/app/api/settings/providers/_lib";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_TYPES = [
  "catalog",
  "inventory",
  "performance",
  "returns",
  "buybox",
  "scan-pending",
  "subscribe-webhook",
] as const;

type SyncType = (typeof VALID_TYPES)[number];

function cronPath(type: SyncType): string {
  if (type === "scan-pending") return "walmart-scan-pending";
  if (type === "subscribe-webhook") return "walmart-subscribe-webhook";
  return `walmart-sync-${type}`;
}

export async function GET() {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json({ ok: true, types: VALID_TYPES });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if ("error" in ctx) return ctx.error;

  let body: { type?: string };
  try {
    body = (await req.json()) as { type?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = body.type as SyncType | undefined;
  if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: "invalid_type", valid: VALID_TYPES },
      { status: 422 },
    );
  }

  const secret = process.env.CRON_SECRET;
  const baseUrl = process.env.INTAKE_PUBLIC_APP_URL;
  if (!secret || !baseUrl) {
    return NextResponse.json(
      { error: "cron_not_configured" },
      { status: 503 },
    );
  }

  const cronUrl = `${baseUrl}/api/cron/${cronPath(type)}`;

  try {
    const resp = await fetch(cronUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });

    const detail = await resp.json().catch(() => null);

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: "cron_error", detail },
        { status: resp.status },
      );
    }

    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
