// Lee el inbox del portal Cleo WebEDI usando la API interna del SPA
// (WEBEDI.mailbox.inboxdatatable). Requiere que el browser ya haya hecho login.

import type { Page } from "playwright-core";
import type { CleoRLog } from "./runner";
import { cleoRLog0 } from "./runner";

export type CleoInboxItem = {
  messageId: string;
  reference: string;
  document: string; // "850", "856", etc.
  batchId: string;
  date: string;
};

type RawRow = {
  messageId: string;
  reference: string;
  document: string;
  batchId: string;
  date: string;
};

// Lee el inbox del portal Cleo usando la API interna del SPA (WEBEDI.mailbox.inboxdatatable).
// Tras el login el DataTable ya está inicializado — lo usamos con rows({ page: 'all' })
// para obtener todos los mensajes de la vista actual.
// Si DataTables falla, hace fallback leyendo los <tr> del DOM.
export async function readCleoInbox(
  page: Page,
  log: CleoRLog = cleoRLog0,
): Promise<CleoInboxItem[]> {
  log("info", "Leyendo inbox del portal Cleo...");

  const items = await page.evaluate((): Array<RawRow> => {
    type DT = {
      rows: (opts?: Record<string, unknown>) => {
        data: () => { toArray?: () => unknown[] } & Iterable<unknown>;
      };
    };
    const w = window as unknown as { WEBEDI?: { mailbox?: { inboxdatatable?: DT } } };
    const dt = w.WEBEDI?.mailbox?.inboxdatatable;

    let rows: unknown[] = [];

    // Estrategia 1: DataTables API
    if (dt && typeof dt.rows === "function") {
      try {
        const data = dt.rows({ page: "all" }).data();
        rows =
          typeof (data as { toArray?: () => unknown[] }).toArray === "function"
            ? (data as { toArray: () => unknown[] }).toArray()
            : Array.from(data as Iterable<unknown>);
      } catch {
        /* fallthrough */
      }
    }

    // Estrategia 2: DOM fallback — leer la tabla directamente
    if (rows.length === 0) {
      const tables = Array.from(document.querySelectorAll("table"));
      for (const table of tables) {
        const ths = Array.from(table.querySelectorAll("th")).map(
          (h) => h.textContent?.trim() ?? "",
        );
        const msgIdx = ths.findIndex((h) => h.toLowerCase() === "message");
        const docIdx = ths.findIndex((h) => h.toLowerCase() === "document");
        if (msgIdx < 0 || docIdx < 0) continue;
        const refIdx = ths.findIndex((h) => h.toLowerCase().includes("reference"));
        const batchIdx = ths.findIndex((h) => h.toLowerCase().includes("batch"));
        const dateIdx = ths.findIndex((h) => h.toLowerCase() === "date");
        for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
          const cells = Array.from(tr.querySelectorAll("td")).map(
            (td) => td.textContent?.trim() ?? "",
          );
          const msgId = cells[msgIdx] ?? "";
          if (!msgId) continue;
          rows.push({
            messageId: msgId,
            document: cells[docIdx] ?? "",
            reference: refIdx >= 0 ? (cells[refIdx] ?? "") : "",
            batchId: batchIdx >= 0 ? (cells[batchIdx] ?? "") : "",
            date: dateIdx >= 0 ? (cells[dateIdx] ?? "") : "",
          });
        }
        if (rows.length > 0) break;
      }
    }

    // Normalizar filas que pueden ser arrays u objetos
    return rows.flatMap((row): Array<RawRow> => {
      if (!row) return [];
      if (Array.isArray(row)) {
        // Orden típico: Date(0) Time(1) Document(2) Interchange(3) Control(4) Reference(5) Message(6) BatchId(7)
        const msgId = String(row[6] ?? "").trim();
        if (!msgId) return [];
        return [
          {
            date: String(row[0] ?? "").trim(),
            document: String(row[2] ?? "").trim(),
            reference: String(row[5] ?? "").trim(),
            messageId: msgId,
            batchId: String(row[7] ?? "").trim(),
          },
        ];
      }
      if (typeof row === "object") {
        const r = row as Record<string, unknown>;
        const msgId = String(
          r.Message ?? r.message ?? r.messageId ?? r["Message ID"] ?? "",
        ).trim();
        if (!msgId) return [];
        return [
          {
            date: String(r.Date ?? r.date ?? "").trim(),
            document: String(r.Document ?? r.document ?? "").trim(),
            reference: String(r.Reference ?? r.reference ?? "").trim(),
            messageId: msgId,
            batchId: String(r["Batch Id"] ?? r.batchId ?? "").trim(),
          },
        ];
      }
      return [];
    });
  });

  const valid = items.filter((i) => i.messageId.length > 0);
  log(
    "ok",
    `${valid.length} mensajes en el inbox (${valid.filter((i) => i.document === "850").length} son 850)`,
  );
  return valid;
}
