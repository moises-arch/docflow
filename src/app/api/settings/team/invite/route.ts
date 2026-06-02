import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidRole(value: string): value is "owner" | "member" {
  return value === "owner" || value === "member";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: { email?: unknown; role?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = cleanText(body.email);
  const role = cleanText(body.role) || "member";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 422 });
  }

  if (!isValidRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 422 });
  }

  const { data, error } = await (
    supabase as typeof supabase & {
      rpc: (
        fn: "add_tenant_member_by_email",
        args: { p_tenant_id: string; p_email: string; p_role: "owner" | "member" },
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    }
  ).rpc("add_tenant_member_by_email", {
    p_tenant_id: membership.tenant_id,
    p_email: email,
    p_role: role,
  });

  if (error) {
    const msg = error.message ?? "Invitation failed";
    if (msg.includes("User not found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Invitation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, member: Array.isArray(data) ? data[0] : data });
}
