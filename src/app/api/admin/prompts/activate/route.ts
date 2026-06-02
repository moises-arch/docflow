//
// Endpoint para activar una versión específica de un prompt (rollback).
// Protegido por la passcode cookie de /api/admin/prompts/unlock.
//
// Body: { prompt_id: string, version_label: string }
// Flujo:
//   1. Verificar cookie de unlock.
//   2. Obtener email del usuario logueado (para audit).
//   3. En transacción Supabase: desactivar la versión activa actual y activar la nueva.
//
// IMPORTANTE: este endpoint NO permite editar prompts ni crear versiones nuevas
// — solo cambiar cuál de las versiones existentes está activa. Las versiones
// nuevas se crean vía migration desde el código.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { PROMPTS_COOKIE_NAME } from "../unlock/route";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // Gate 1: passcode cookie
  const jar = await cookies();
  if (jar.get(PROMPTS_COOKIE_NAME)?.value !== "1") {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }

  // Audit: email del usuario logueado (best effort, no es bloqueante)
  let userEmail: string | null = null;
  try {
    const supa = await createClient();
    const { data } = await supa.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    /* ignore */
  }

  let promptId: string | null = null;
  let versionLabel: string | null = null;
  try {
    const body = (await request.json()) as { prompt_id?: unknown; version_label?: unknown };
    if (typeof body.prompt_id === "string") promptId = body.prompt_id.trim();
    if (typeof body.version_label === "string") versionLabel = body.version_label.trim();
  } catch {
    /* fall through */
  }

  if (!promptId || !versionLabel) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Cliente admin (service role) para bypass de RLS
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const admin = createServerClient(url, key, { auth: { persistSession: false } });

  // Verificar que la versión objetivo existe
  const { data: target, error: lookupErr } = await admin
    .from("prompt_versions")
    .select("id, is_active")
    .eq("prompt_id", promptId)
    .eq("version_label", versionLabel)
    .maybeSingle();

  if (lookupErr) {
    console.error("[prompts/activate] lookup failed:", lookupErr.message);
    return NextResponse.json({ error: "db_lookup_failed" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  }
  if (target.is_active) {
    return NextResponse.json({ ok: true, noop: true, message: "already_active" });
  }

  // Transacción: desactivar la activa actual, activar la nueva.
  // Supabase JS client no expone transacciones nativas — usamos dos updates
  // secuenciales. El partial unique index obliga el orden (deactivate first).
  const { error: deactErr } = await admin
    .from("prompt_versions")
    .update({ is_active: false })
    .eq("prompt_id", promptId)
    .eq("is_active", true);

  if (deactErr) {
    console.error("[prompts/activate] deactivate failed:", deactErr.message);
    return NextResponse.json({ error: "deactivate_failed" }, { status: 500 });
  }

  const { error: actErr } = await admin
    .from("prompt_versions")
    .update({
      is_active: true,
      activated_at: new Date().toISOString(),
      activated_by_email: userEmail,
    })
    .eq("prompt_id", promptId)
    .eq("version_label", versionLabel);

  if (actErr) {
    console.error("[prompts/activate] activate failed:", actErr.message);
    return NextResponse.json({ error: "activate_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    prompt_id: promptId,
    version_label: versionLabel,
    activated_by: userEmail,
  });
}
