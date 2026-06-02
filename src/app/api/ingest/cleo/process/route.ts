// Webhook receiver invoked by the email-ingest Edge Function when a Cleo
// notification email arrives. Triggers the Playwright runner to download the
// PO PDF for the given cleo_message_id. Auth is via INTAKE_CLEO_INTERNAL_TOKEN
// (shared secret between the Edge Function and Vercel).
import { runCleoJob, type CleoJob } from "@/lib/cleo/runner";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // Playwright cold start + Cleo nav + download

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(req: NextRequest): boolean {
  const expected = process.env.INTAKE_CLEO_INTERNAL_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get("x-cleo-internal-token");
  return Boolean(provided && provided === expected);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<CleoJob> & { dry_run?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Smoke test mode: verify the runner's serverless instance has access to
  // the env vars without actually launching Playwright. Catches the
  // "stale-instance after deploy" failure mode where smoke test (running on
  // a different function) sees vars but the runner instance doesn't.
  if (body.dry_run === true) {
    const haveUser = Boolean(process.env.CLEO_USERNAME);
    const havePass = Boolean(process.env.CLEO_PASSWORD);
    const haveSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const haveSupabaseKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const ok = haveUser && havePass && haveSupabaseUrl && haveSupabaseKey;
    return NextResponse.json(
      {
        dry_run: true,
        ok,
        env: {
          cleo_username: haveUser,
          cleo_password: havePass,
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
  if (!body.cleo_message_id) {
    return NextResponse.json({ error: "Missing cleo_message_id" }, { status: 422 });
  }
  if (!body.inbound_email_id || !UUID_RE.test(body.inbound_email_id)) {
    return NextResponse.json({ error: "Invalid inbound_email_id" }, { status: 422 });
  }

  const job: CleoJob = {
    tenant_id: body.tenant_id,
    inbound_email_id: body.inbound_email_id,
    cleo_message_id: String(body.cleo_message_id),
    cleo_reference: String(body.cleo_reference ?? ""),
    cleo_batch_id: String(body.cleo_batch_id ?? ""),
    trading_partner: body.trading_partner ?? null,
    subject: body.subject ?? null,
    from_email: body.from_email ?? "",
  };

  const result = await runCleoJob(job);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
