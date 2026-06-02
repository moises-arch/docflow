/**
 * Single Claude Haiku call that returns document boundaries (which pages
 * belong to which document) for multi-page PDFs.
 *
 * El prompt se lee de prompt_versions (versión activa) con fallback al
 * DETECTION_PROMPT hardcoded como safety net.
 */

import { getActivePrompt } from "./prompts-db.ts";

export interface DocumentBoundary {
  page_start: number;   // 1-indexed, inclusive
  page_end: number;     // 1-indexed, inclusive
  document_type: "purchase_order" | "invoice" | "quote" | "delivery_note" | "other";
  identifier: string | null;  // PO number, invoice number, etc. if visible
}

interface BoundaryApiResponse {
  documents: Array<{
    page_start: unknown;
    page_end: unknown;
    document_type: unknown;
    identifier: unknown;
  }>;
}

const VALID_TYPES = new Set([
  "purchase_order", "invoice", "quote", "delivery_note", "other",
]);

const DETECTION_PROMPT = (pageCount: number) =>
  `Analyze a PDF and return its document boundaries (which pages belong to which document).

The PDF may contain ONE business document spanning multiple pages, or MULTIPLE
distinct documents bundled together. Default assumption: ONE document.
Only declare a boundary when you are CERTAIN a new independent document begins.

A NEW DOCUMENT starts ONLY when a page contains ALL of these signals:
  - A NEW header/title (e.g. "Purchase Order", "Invoice", "Quote").
  - A DIFFERENT identifier (PO number, invoice number, etc.) than previous pages.
  - It is INDEPENDENTLY actionable — own buyer/seller/items/totals — without referencing prior pages.

A page is a CONTINUATION (same document) when it has any of:
  - Terms & conditions, fine print, legal text, warranty info.
  - Delivery / shipping / handling instructions.
  - Notes, comments, addenda, appendices.
  - Continuation of line items started on a previous page.
  - Same PO/invoice number as the previous page (even if reformatted).
  - "Page X of Y" pagination references.
  - Routing labels, barcodes, carrier paperwork.
  - Empty header / no document type label / blank page.
  - Signature pages or confirmation pages tied to the prior document.

For each distinct document provide:
- page_start, page_end (1-indexed, inclusive)
- document_type: "purchase_order" | "invoice" | "quote" | "delivery_note" | "other"
- identifier: PO/invoice number visible on its first page (null if absent)

Hard rules:
- Total pages: ${pageCount}. Ranges MUST cover ALL pages with NO gaps.
- DEFAULT: return ONE entry spanning 1-${pageCount}. Only split if very confident.
- When in doubt, MERGE the page into the previous document. Bias heavily toward fewer documents.
- Two pages with the same identifier ALWAYS belong to the same document.
- Pages without their own identifier belong to the previous document.

Respond ONLY with valid JSON — no markdown, no explanation:
{"documents":[{"page_start":1,"page_end":${pageCount},"document_type":"purchase_order","identifier":"PO-12345"}]}`;

/**
 * Single Haiku call that returns document boundaries for a PDF.
 * Falls back to a single "other" boundary spanning the whole PDF if the
 * call fails or the response cannot be parsed.
 *
 * Caller should skip this for single-page PDFs (1 page = 1 doc by definition)
 * to save the Haiku roundtrip entirely.
 */
export async function detectDocumentBoundaries(
  anthropicApiKey: string,
  fileBase64: string,
  mimeType: string,
  pageCount: number,
): Promise<DocumentBoundary[]> {
  const single: DocumentBoundary[] = [
    { page_start: 1, page_end: Math.max(1, pageCount), document_type: "other", identifier: null },
  ];

  if (pageCount <= 0 || !mimeType.includes("pdf")) {
    return single;
  }

  console.log(`[boundary-detection] Analyzing ${pageCount}-page PDF`);

  // Cargar la versión activa del prompt desde DB con fallback al hardcoded.
  // El template raw tiene `${pageCount}` literal que necesitamos interpolar.
  const active = await getActivePrompt("boundary-detection");
  const promptModel = active?.model ?? "claude-haiku-4-5-20251001";
  const promptMaxTokens = active?.maxTokens ?? 1024;
  const promptText = active?.content
    ? active.content.replace(/\$\{pageCount\}/g, String(pageCount))
    : DETECTION_PROMPT(pageCount);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: promptModel,
        max_tokens: promptMaxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
              },
              { type: "text", text: promptText },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[boundary-detection] Network error:", err);
    return single;
  }

  if (!res.ok) {
    console.error("[boundary-detection] API error:", res.status, await res.text().catch(() => ""));
    return single;
  }

  let rawText = "";
  try {
    const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
    rawText = data.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in response");

    const parsed = JSON.parse(jsonMatch[0]) as BoundaryApiResponse;

    let boundaries: DocumentBoundary[] = single;
    if (Array.isArray(parsed.documents) && parsed.documents.length > 0) {
      const parsedBoundaries = parsed.documents.map((d) => ({
        page_start: Math.max(1, Math.min(pageCount, Number(d.page_start) || 1)),
        page_end: Math.max(1, Math.min(pageCount, Number(d.page_end) || pageCount)),
        document_type: VALID_TYPES.has(String(d.document_type))
          ? (d.document_type as DocumentBoundary["document_type"])
          : "other",
        identifier: typeof d.identifier === "string" && d.identifier.trim()
          ? d.identifier.trim()
          : null,
      }));
      parsedBoundaries.sort((a, b) => a.page_start - b.page_start);

      // Post-process safety net: merge adjacent documents that look like the same document
      const merged: DocumentBoundary[] = [];
      for (const b of parsedBoundaries) {
        const prev = merged[merged.length - 1];
        if (!prev) {
          merged.push(b);
          continue;
        }
        const sameId = prev.identifier && b.identifier && prev.identifier === b.identifier;
        const continuation = prev.identifier && !b.identifier;
        const supplementary = b.document_type === "other" && prev.document_type !== "other";

        if (sameId || continuation || supplementary) {
          prev.page_end = Math.max(prev.page_end, b.page_end);
          console.log(
            `[boundary-detection] Merged page ${b.page_start}-${b.page_end} into prev document (reason: ${sameId ? "same id" : continuation ? "continuation" : "supplementary"})`,
          );
        } else {
          merged.push(b);
        }
      }
      if (merged.length > 0) boundaries = merged;
    }

    console.log(
      `[boundary-detection] ${boundaries.length} document(s):`,
      boundaries.map((b) => `[${b.page_start}-${b.page_end}] ${b.document_type} ${b.identifier ?? ""}`).join(", "),
    );

    return boundaries;
  } catch (err) {
    console.error("[boundary-detection] Parse error:", err, "| Raw:", rawText.slice(0, 500));
    return single;
  }
}
