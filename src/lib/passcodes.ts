// Client-side passcode management — stored in localStorage.
// The master code (1987) is always valid and cannot be removed.

const STORAGE_KEY = "sdm_passcodes";
const MASTER_CODE = "1987";

export function getPasscodes(): string[] {
  if (typeof window === "undefined") return [MASTER_CODE];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    return [MASTER_CODE, ...stored.filter(c => c !== MASTER_CODE)];
  } catch {
    return [MASTER_CODE];
  }
}

export function addPasscode(code: string): void {
  if (typeof window === "undefined") return;
  if (!/^\d{4}$/.test(code)) throw new Error("El código debe ser de 4 dígitos");
  if (code === MASTER_CODE) return; // master always valid
  const current = getPasscodes().filter(c => c !== MASTER_CODE);
  if (current.includes(code)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, code]));
}

export function removePasscode(code: string): void {
  if (typeof window === "undefined") return;
  if (code === MASTER_CODE) return; // can't remove master
  const current = getPasscodes().filter(c => c !== MASTER_CODE);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter(c => c !== code)));
}

export function isValidPasscode(code: string): boolean {
  return getPasscodes().includes(code);
}
