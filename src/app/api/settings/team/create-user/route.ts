import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

function isValidRole(v: string): v is "owner" | "member" {
  return v === "owner" || v === "member";
}

export async function POST(req: NextRequest) {
  // 1. Verify caller is an owner
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("tenant_members").select("tenant_id, role").eq("user_id", user.id).single();
  if (!membership?.tenant_id) return NextResponse.json({ error: "No tenant" }, { status: 403 });
  if (membership.role !== "owner") return NextResponse.json({ error: "Owner required" }, { status: 403 });

  // 2. Parse body
  let body: { email?: unknown; password?: unknown; name?: unknown; role?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = (typeof body.role === "string" ? body.role : "member");

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Email inválido" }, { status: 422 });
  if (password.length < 8)
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 422 });
  if (!isValidRole(role))
    return NextResponse.json({ error: "Rol inválido" }, { status: 422 });

  // 3. Create user in Supabase Auth (service role)
  const svc = createServiceClient();
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm, no email verification needed
    user_metadata: name ? { full_name: name } : {},
  });

  if (createErr) {
    if (createErr.message?.toLowerCase().includes("already been registered") ||
        createErr.message?.toLowerCase().includes("already exists")) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    }
    return NextResponse.json({ error: createErr.message ?? "No se pudo crear el usuario" }, { status: 500 });
  }

  // 4. Add to tenant_members
  const { error: memberErr } = await svc
    .from("tenant_members")
    .insert({ user_id: created.user.id, tenant_id: membership.tenant_id, role });

  if (memberErr) {
    // Rollback: delete the user we just created
    await svc.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Usuario creado pero no se pudo agregar al tenant" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: created.user.id, email: created.user.email, role },
  });
}
