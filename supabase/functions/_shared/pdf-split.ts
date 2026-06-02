import { PDFDocument } from "npm:pdf-lib@1.17.1";

/**
 * Extracts a contiguous page range from a PDF buffer and returns a new PDF.
 * startPage and endPage are 1-indexed and inclusive.
 *
 * Page orientation: pdf-lib's copyPages preserves both the MediaBox dimensions
 * and the rotation flag of the source page. We don't touch either — landscape
 * pages stay landscape, portrait stays portrait, and any explicit rotation
 * metadata travels with the page unchanged.
 */
export async function extractPageRange(
  pdfBytes: Uint8Array,
  startPage: number,
  endPage: number,
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const clampedStart = Math.max(1, Math.min(startPage, totalPages));
  const clampedEnd = Math.max(clampedStart, Math.min(endPage, totalPages));

  const indices = Array.from(
    { length: clampedEnd - clampedStart + 1 },
    (_, i) => clampedStart - 1 + i,
  );

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, indices);
  copied.forEach((p) => newDoc.addPage(p));

  return await newDoc.save();
}

/** Returns the page count of a PDF buffer without loading all content. */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return 1;
  }
}

/**
 * Merges all pages of a multi-page PDF into a single tall page by stacking
 * them vertically. Content is preserved exactly — only the page boundaries
 * are removed. Returns the original buffer unchanged if already single-page.
 * Capped at 6 pages to avoid creating unusably large images.
 */
export async function mergePagesTall(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = srcDoc.getPageCount();
  if (pageCount <= 1 || pageCount > 6) return pdfBytes;

  const pageDims: Array<{ width: number; height: number }> = [];
  let totalHeight = 0;
  let maxWidth = 0;

  for (let i = 0; i < pageCount; i++) {
    const { width, height } = srcDoc.getPage(i).getSize();
    pageDims.push({ width, height });
    totalHeight += height;
    maxWidth = Math.max(maxWidth, width);
  }

  const newDoc = await PDFDocument.create();
  const merged = newDoc.addPage([maxWidth, totalHeight]);

  let yOffset = totalHeight;
  for (let i = 0; i < pageCount; i++) {
    yOffset -= pageDims[i].height;
    const embedded = await newDoc.embedPage(srcDoc.getPage(i));
    merged.drawPage(embedded, {
      x: 0,
      y: yOffset,
      width: pageDims[i].width,
      height: pageDims[i].height,
    });
  }

  return await newDoc.save();
}
