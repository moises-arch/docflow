"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type SheetData = { name: string; rows: string[][] };

interface ExcelViewerProps {
  url: string;
  fileName: string;
}

export function ExcelViewer({ url, fileName }: ExcelViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const wb = XLSX.read(buf, { type: "array" });
        const parsed: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
            header: 1,
            defval: "",
            raw: false,
          });
          return { name, rows: rows as string[][] };
        }).filter((s) => s.rows.length > 0);
        setSheets(parsed);
        setActiveSheet(0);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-mute)]">
        Cargando {fileName}…
      </div>
    );
  }

  if (error || sheets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-rose)]">
        No se pudo leer el archivo Excel.
      </div>
    );
  }

  const sheet = sheets[activeSheet];
  // Treat first row as header
  const [header, ...dataRows] = sheet.rows;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-mute)] px-3 pt-2">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={[
                "rounded-t px-3 py-1.5 text-xs font-medium transition-colors",
                i === activeSheet
                  ? "border border-b-0 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
              ].join(" ")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <table className="w-full border-collapse text-xs">
          {header && header.some(Boolean) && (
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-[var(--color-border)] bg-[var(--color-surface-mute)] px-3 py-2 text-left font-semibold text-[var(--color-fg)] whitespace-nowrap"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri} className="even:bg-[var(--color-surface-mute)]/40">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border border-[var(--color-border)] px-3 py-2 text-[var(--color-fg)] whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
