/**
 * Signed scan-token helper.
 *
 * Encodes a small payload ({ tenant_id, user_id, exp }) into a URL-safe token
 * signed with HMAC-SHA256. Used by the public QR upload endpoint so paper
 * documents can be uploaded WITHOUT a session, but ONLY by holders of a token
 * that was minted by an authenticated tenant member.
 *
 * Token format: <base64url(payload)>.<base64url(signature)>
 * Signature uses SUPABASE_SERVICE_ROLE_KEY as HMAC key (already a server secret).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ScanTokenPayload {
  tenant_id: string;
  user_id: string;
  exp: number; // unix seconds
}

function getSecret(): string {
  // SCAN_TOKEN_SECRET is mandatory. Previously this fell back to
  // SUPABASE_SERVICE_ROLE_KEY, which conflated purposes (rotating the
  // service key would invalidate every QR code in circulation) and meant a
  // missing SCAN_TOKEN_SECRET silently used a much more sensitive secret.
  const key = process.env.SCAN_TOKEN_SECRET;
  if (!key) {
    // Fall back to service role key ONLY if explicitly allowed for legacy
    // tokens minted before this hardening. Production must set SCAN_TOKEN_SECRET.
    const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (legacy && process.env.SCAN_TOKEN_ALLOW_LEGACY === "true") return legacy;
    throw new Error("Missing SCAN_TOKEN_SECRET (required)");
  }
  return key;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signScanToken(payload: ScanTokenPayload): string {
  const json = JSON.stringify(payload);
  const body = b64urlEncode(Buffer.from(json, "utf8"));
  const sig = createHmac("sha256", getSecret()).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifyScanToken(token: string): ScanTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sig);
  } catch {
    return null;
  }
  const expectedSig = createHmac("sha256", getSecret()).update(body).digest();
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  let payload: ScanTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.tenant_id !== "string" || typeof payload.user_id !== "string") return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
