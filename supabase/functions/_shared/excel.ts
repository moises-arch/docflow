import * as XLSX from "npm:xlsx@0.18.5";

type Section = { headers: string[]; rows: string[][] };

// A row looks like a header when ≥60% of its non-empty cells are non-numeric strings.
function looksLikeHeader(row: string[]): boolean {
  const nonEmpty = row.filter(Boolean);
  if (nonEmpty.length === 0) return false;
  const textCells = nonEmpty.filter((c) => isNaN(Number(c))).length;
  return textCells / nonEmpty.length >= 0.6;
}

// Detect if this section's headers indicate line items (products/quantities/prices).
function isLineItemsSection(headers: string[]): boolean {
  const joined = headers.join(" ").toLowerCase();
  return (
    /\bqty\b|\bquantity\b|\bcantidad\b/.test(joined) ||
    /\bprice\b|\bprecio\b|\bcosto\b|\bcost\b/.test(joined) ||
    /\bsku\b|\bitem\b|\bproduct\b|\bpart\b|\bartículo\b|\bunit\b/.test(joined)
  );
}

// If a header in a LINE ITEMS section looks generic (e.g. "Columna1", "Column2",
// "Col1", "Field1", empty), rename it to "SKU/Product" so Claude understands it's
// the product identifier. Only applies to the FIRST column of the section.
function normalizeLineItemHeaders(headers: string[]): string[] {
  return headers.map((h, i) => {
    const clean = h.trim();
    if (i === 0 && (!clean || /^(col(umna?)?|field|columna)\s*\d*$/i.test(clean))) {
      return "SKU/Product";
    }
    return clean || h;
  });
}

// Split rows into logical sections: a new section starts when a header-like row
// appears after at least one data row.
function splitSections(rows: string[][]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const row of rows) {
    if (row.filter(Boolean).length === 0) continue; // skip blank rows

    if (!current) {
      current = { headers: row, rows: [] };
    } else if (looksLikeHeader(row) && current.rows.length > 0) {
      sections.push(current);
      current = { headers: row, rows: [] };
    } else {
      current.rows.push(row);
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function excelToText(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  const workbook = XLSX.read(data, { type: "array" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];

    if (rawRows.length === 0) continue;

    const sections = splitSections(rawRows);
    if (sections.length === 0) continue;

    const sheetLines: string[] = [`=== Sheet: ${sheetName} ===`];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const lineItems = isLineItemsSection(sec.headers);
      const isFirstOrderHeader = i === 0 && !lineItems && sec.rows.length <= 3;

      if (isFirstOrderHeader) {
        // Key-value block: easier for Claude to read order header fields
        sheetLines.push("\n[ORDER HEADER]");
        for (const dataRow of sec.rows) {
          for (let j = 0; j < sec.headers.length; j++) {
            const key = (sec.headers[j] ?? "").trim();
            const val = (dataRow[j] ?? "").trim();
            if (key && val) sheetLines.push(`${key}: ${val}`);
          }
        }
      } else {
        // Table block — label clearly so Claude maps columns to line items.
        // Only output columns that have a non-empty header.
        const label = lineItems ? "[LINE ITEMS]" : `[TABLE ${i + 1}]`;
        sheetLines.push(`\n${label}`);
        const colIndices = sec.headers
          .map((h, j) => (h.trim() ? j : -1))
          .filter((j) => j >= 0);
        const rawHeaders = colIndices.map((j) => sec.headers[j]);
        const visibleHeaders = lineItems ? normalizeLineItemHeaders(rawHeaders) : rawHeaders;
        sheetLines.push(`| ${visibleHeaders.join(" | ")} |`);
        for (const row of sec.rows) {
          const cells = colIndices.map((j) => (row[j] ?? "").trim());
          sheetLines.push(`| ${cells.join(" | ")} |`);
        }
      }
    }

    parts.push(sheetLines.join("\n"));
  }

  return parts.join("\n\n");
}

export function isExcelMimeOrName(mime: string, filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  );
}
