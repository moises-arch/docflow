// Webhook receiver invoked by email-pipeline (edge function) when a Rithum
// "New Order Alert" email arrives. Triggers the Playwright runner to navigate
// to the order detail page and render it to PDF. Auth via
// INTAKE_RITHUM_INTERNAL_TOKEN (shared secret edge ↔ Vercel).
import { runRithumJob, type RithumJob } from "@/lib/rithum/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // Playwright cold start + nav + render

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(req: NextRequest): boolean {
  const expected = process.env.INTAKE_RITHUM_INTERNAL_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get("x-rithum-internal-token");
  return Boolean(provided && provided === expected);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<RithumJob> & { dry_run?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Smoke test mode: verify the runner instance has env vars without launching
  // Playwright. Catches stale-instance failure modes after deploy.
  if (body.dry_run === true) {
    const haveUser = Boolean(process.env.RITHUM_USERNAME);
    const havePass = Boolean(process.env.RITHUM_PASSWORD);
    const haveSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const haveSupabaseKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const ok = haveUser && havePass && haveSupabaseUrl && haveSupabaseKey;
    return NextResponse.json(
      {
        dry_run: true,
        ok,
        env: {
          rithum_username: haveUser,
          rithum_password: havePass,
          supabase_url: haveSupabaseUrl,
          supabase_service_key: haveSupabaseKey,
        },
      },
      { status: ok ? 200 : 503 },
    );
  }

  if (!body.tenant_id || !UUID_RE.test(body.tenant_id)) {
    return NextResponse.json({ error: "Invalid tenant_id" }, { status: 422 });
  }
  if (!body.rithum_order_number) {
    return NextResponse.json({ error: "Missing rithum_order_number" }, { status: 422 });
  }
  // inbound_email_id is optional — scan-pending passes null (no email trigger).
  if (body.inbound_email_id != null && !UUID_RE.test(body.inbound_email_id)) {
    return NextResponse.json({ error: "Invalid inbound_email_id" }, { status: 422 });
  }

  const job: RithumJob = {
    tenant_id: body.tenant_id,
    inbound_email_id: body.inbound_email_id ?? null,
    rithum_order_number: String(body.rithum_order_number),
    rithum_partner: String(body.rithum_partner ?? ""),
    rithum_partner_pid: body.rithum_partner_pid ?? null,
    rithum_order_date: body.rithum_order_date ?? null,
    subject: body.subject ?? null,
    from_email: body.from_email ?? "",
  };

  const result = await runRithumJob(job);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
