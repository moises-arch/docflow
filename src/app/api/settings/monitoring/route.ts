import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Payload = {
  api_key?: unknown;
  test_only?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return {
      error: NextResponse.json({ error: "No active tenant" }, { status: 403 }),
    } as const;
  }
  if (membership.role !== "owner") {
    return {
      error: NextResponse.json({ error: "Owner access required" }, { status: 403 }),
    } as const;
  }

  return { supabase, tenantId: membership.tenant_id } as const;
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const apiKey = cleanText(payload.api_key);
  const testOnly = payload.test_only === true;

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 422 });
  }

  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/save-monitoring-connection`;
  const edgeRes = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      tenant_id: guard.tenantId,
      api_key: apiKey,
      test_only: testOnly,
    }),
  });

  const body = (await edgeRes.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
    account_email?: string | null;
  };

  if (!edgeRes.ok) {
    return NextResponse.json(
      { error: body.error ?? "Failed to save monitoring config", detail: body.detail ?? null },
      { status: edgeRes.status >= 400 && edgeRes.status < 500 ? edgeRes.status : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "active",
    account_email: body.account_email ?? null,
  });
}

export async function DELETE() {
  const guard = await requireOwner();
  if ("error" in guard) return guard.error;

  const db = guard.supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { error } = await db
    .from("monitoring_connections")
    .delete()
    .eq("tenant_id", guard.tenantId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to disconnect", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
