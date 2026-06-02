// Helpers para hash/verify del PIN del QR mobile.
//
// El PIN es de 4 dígitos (10.000 opciones). El hashing no es la defensa
// principal — confiamos en rate limiting al endpoint de verify. Aún así
// hasheamos con SHA-256 + salt aleatorio para que un dump de la DB no
// exponga el PIN en texto plano.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface ScanPinHash {
  hash: string;
  salt: string;
}

export function hashScanPin(pin: string): ScanPinHash {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN debe ser exactamente 4 dígitos");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(pin + salt).digest("hex");
  return { hash, salt };
}

export function verifyScanPin(
  pin: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  if (!storedHash || !storedSalt) return false;
  const candidate = createHash("sha256").update(pin + storedSalt).digest("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
