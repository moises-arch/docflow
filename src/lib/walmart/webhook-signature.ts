// Walmart webhook signature validation.
//
// Walmart signs webhook deliveries with HMAC-SHA256 using a shared secret.
// The signature arrives in the WM-SVC-SIG header. We must validate it before
// trusting the body — otherwise anyone could spam our endpoint.
//
// The exact signing scheme (which fields are signed, separator, algorithm) is
// confirmed in the Walmart docs at the time of subscription. As a defensive
// pattern we accept multiple known variants and accept the first that matches.

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validate a Walmart webhook signature.
 *
 * @param rawBody  the EXACT raw bytes of the request body (do not parse first)
 * @param signature  the WM-SVC-SIG header value
 * @param secret  WALMART_WEBHOOK_SECRET env var
 * @returns  true if signature matches
 */
export function validateWalmartSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) {
    // No secret configured — accept all in dev mode but warn loudly.
    console.warn(
      "[walmart] webhook signature validation skipped — WALMART_WEBHOOK_SECRET not set",
    );
    return process.env.NODE_ENV !== "production";
  }
  if (!signature) return false;

  // Try the most common HMAC-SHA256 base64 variant first.
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  if (constantTimeEqual(signature, expected)) return true;

  // Hex variant (some Walmart docs show this).
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (constantTimeEqual(signature, expectedHex)) return true;

  // Variant with "sha256=" prefix (Github-style)
  if (signature.startsWith("sha256=")) {
    const sigVal = signature.slice("sha256=".length);
    if (constantTimeEqual(sigVal, expected) || constantTimeEqual(sigVal, expectedHex)) {
      return true;
    }
  }

  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
