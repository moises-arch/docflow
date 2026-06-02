/**
 * Batch re-runs the odoo-fix-addresses edge function over previously synced
 * order_drafts. Use it once to isolate partner records for old orders that
 * still share child contacts from the pre-isolation era.
 *
 * Usage:
 *   pnpm tsx scripts/fix-addresses-batch.ts                          (last 30 days, all tenants, dry-run)
 *   pnpm tsx scripts/fix-addresses-batch.ts --days=60 --apply        (apply for last 60 days)
 *   pnpm tsx scripts/fix-addresses-batch.ts --so=S09584 --apply      (a single SO by name)
 *   pnpm tsx scripts/fix-addresses-batch.ts --tenant=<uuid> --apply  (scope to one tenant)
 *
 * Reads env from process.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Falls back to .env.local automatically when run via tsx in the app dir.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Minimal .env.local loader (no extra deps) ────────────────────────────────
function loadEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name: string): string | null {
  for (const a of args) {
    if (a === `--${name}`) return "true";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return null;
}

const APPLY    = arg("apply") !== null;
const DRY_RUN  = !APPLY;
const DAYS     = Number(arg("days") ?? 30);
const TENANT   = arg("tenant");
const SO_NAME  = arg("so");
const DELAY_MS = Number(arg("delay") ?? 400);

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.INTAKE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.INTAKE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env / .env.local");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function sb<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function invokeFix(orderDraftId: string, tenantId: string): Promise<{
  ok: boolean; status: number; body: unknown;
}> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/odoo-fix-addresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ order_draft_id: orderDraftId, tenant_id: tenantId }),
    signal: AbortSignal.timeout(60_000),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Build query ──────────────────────────────────────────────────────────────
type Draft = {
  id: string;
  tenant_id: string;
  po_number: string | null;
  odoo_so_id: number | null;
  odoo_so_name: string | null;
  approved_at: string | null;
};

const filters: string[] = [
  "sync_state=eq.synced",
  "odoo_so_id=not.is.null",
  "select=id,tenant_id,po_number,odoo_so_id,odoo_so_name,approved_at",
  "order=approved_at.desc",
  "limit=1000",
];

if (SO_NAME) {
  filters.push(`odoo_so_name=eq.${encodeURIComponent(SO_NAME)}`);
} else {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  filters.push(`approved_at=gte.${encodeURIComponent(since)}`);
}
if (TENANT) filters.push(`tenant_id=eq.${TENANT}`);

// ── Run ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(
    `🔍 Mode: ${DRY_RUN ? "DRY-RUN (no changes — pass --apply to execute)" : "APPLY"}`,
  );
  console.log(
    SO_NAME
      ? `   Scope: single SO ${SO_NAME}`
      : `   Scope: last ${DAYS} days${TENANT ? `, tenant=${TENANT}` : " (all tenants)"}`,
  );
  console.log(`   Delay between calls: ${DELAY_MS}ms\n`);

  const drafts = await sb<Draft[]>(`order_drafts?${filters.join("&")}`);
  console.log(`📋 Found ${drafts.length} synced draft(s) to process\n`);
  if (drafts.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (DRY_RUN) {
    for (const d of drafts) {
      console.log(
        `  • ${d.odoo_so_name ?? `(no SO name)`}  PO=${d.po_number ?? "—"}  draft=${d.id}  approved=${d.approved_at ?? "—"}`,
      );
    }
    console.log(`\n🔒 Dry-run complete. Re-run with --apply to actually fix ${drafts.length} order(s).`);
    return;
  }

  let ok = 0;
  let failed = 0;
  const errors: Array<{ so: string; error: string }> = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const label = `${i + 1}/${drafts.length}  ${d.odoo_so_name ?? d.id}`;
    process.stdout.write(`  ▶ ${label} … `);
    try {
      const res = await invokeFix(d.id, d.tenant_id);
      if (res.ok && (res.body as { ok?: boolean })?.ok) {
        ok++;
        console.log("✓");
      } else {
        failed++;
        const err = (res.body as { error?: string })?.error ?? `HTTP ${res.status}`;
        errors.push({ so: d.odoo_so_name ?? d.id, error: err });
        console.log(`✗  ${err}`);
      }
    } catch (e) {
      failed++;
      const err = e instanceof Error ? e.message : String(e);
      errors.push({ so: d.odoo_so_name ?? d.id, error: err });
      console.log(`✗  ${err}`);
    }
    if (i < drafts.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓ Success: ${ok}`);
  console.log(`✗ Failed:  ${failed}`);
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errors) console.log(`  • ${e.so}: ${e.error}`);
  }
})().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
