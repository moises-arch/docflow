// Passcode gate para /settings/admin/ai/prompts. La passcode vive solo en el
// server (no se filtra al cliente). Si matches, se setea una cookie httpOnly
// de 12 horas que la página server-side lee para mostrar el visor.

import { NextResponse } from "next/server";

const PROMPTS_PASSCODE = "1987";
export const PROMPTS_COOKIE_NAME = "intake-prompts-unlocked";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60; // 12h

export async function POST(request: Request) {
  let passcode: string | null = null;
  try {
    const body = (await request.json()) as { passcode?: unknown };
    if (typeof body.passcode === "string") passcode = body.passcode.trim();
  } catch {
    /* fall through */
  }

  if (passcode !== PROMPTS_PASSCODE) {
    return NextResponse.json({ error: "invalid_passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: PROMPTS_COOKIE_NAME,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: PROMPTS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
