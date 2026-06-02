// Helpers para el cookie firmado de PIN del QR mobile. Lo emite el endpoint
// verify-pin y lo lee el server component de /scan/[token] para decidir si
// renderiza la pantalla de PIN o el cliente de captura.

import { createHmac } from "node:crypto";

export const PIN_COOKIE_NAME = "sdm_scan_pin";
export const PIN_COOKIE_TTL_SECONDS = 12 * 60 * 60;

function getSecret() {
  return process.env.SCAN_TOKEN_SECRET ?? "dev-secret";
}

export function signPinCookie(tenantId: string, exp: number): string {
  const payload = `${tenantId}.${exp}`;
  const sig = createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex")
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function isPinCookieValid(
  rawCookie: string | undefined,
  tenantId: string,
): boolean {
  if (!rawCookie) return false;
  const parts = rawCookie.split(".");
  if (parts.length !== 3) return false;
  const [cookieTenant, expStr, sig] = parts;
  if (cookieTenant !== tenantId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", getSecret())
    .update(`${cookieTenant}.${expStr}`)
    .digest("hex")
    .slice(0, 32);
  return sig === expected;
}
