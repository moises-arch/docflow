/**
 * AES-256-GCM encrypt/decrypt using the INTAKE_SECRETS_KEY.
 * Storage format: "<iv_hex>:<ciphertext_hex>:<tag_hex>"
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    encoded,
  );

  // Web Crypto appends the 16-byte tag to the ciphertext
  const full = new Uint8Array(ciphertextWithTag);
  const ciphertext = full.slice(0, full.length - 16);
  const tag = full.slice(full.length - 16);

  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

export async function decrypt(stored: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex, tagHex] = stored.split(":");
  if (!ivHex || !ciphertextHex || !tagHex) throw new Error("Invalid encrypted format");

  const key = await importKey(keyHex);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const tag = hexToBytes(tagHex);

  // Concatenate ciphertext + tag for Web Crypto
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(tag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    ciphertextWithTag,
  );

  return new TextDecoder().decode(decrypted);
}
