"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type MimeOption = {
  value: string;
  label: string;
  hint?: string;
};

export const EMAIL_MIME_OPTIONS: MimeOption[] = [
  { value: "application/pdf", label: "PDF", hint: "Recomendado" },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel", hint: ".xlsx" },
  { value: "application/vnd.ms-excel", label: "Excel 97–2003", hint: ".xls" },
  { value: "text/csv", label: "CSV", hint: "Tabla de texto" },
  { value: "application/vnd.oasis.opendocument.spreadsheet", label: "ODS", hint: "LibreOffice" },
  { value: "image/jpeg", label: "JPG / JPEG", hint: "Fotos / scans" },
  { value: "image/png", label: "PNG", hint: "Capturas" },
  { value: "image/webp", label: "WEBP" },
  { value: "image/heic", label: "HEIC", hint: "iPhone" },
  { value: "text/html", label: "HTML", hint: "Cuerpo del correo (gasta IA)" },
  { value: "text/plain", label: "TXT", hint: "Texto plano (gasta IA)" },
];

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  options?: MimeOption[];
  disabled?: boolean;
};

export function MimeTypePicker({ value, onChange, options = EMAIL_MIME_OPTIONS, disabled }: Props) {
  function toggle(mime: string) {
    if (disabled) return;
    if (value.includes(mime)) {
      // Don't allow empty — at least PDF must remain.
      const next = value.filter((v) => v !== mime);
      onChange(next.length > 0 ? next : ["application/pdf"]);
    } else {
      onChange([...value, mime]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-mute)] hover:border-[var(--color-fg-mute)] hover:text-[var(--color-fg)]",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {selected && <Check size={11} />}
            {opt.label}
            {opt.hint && (
              <span className={cn("text-[9px]", selected ? "opacity-80" : "opacity-60")}>
                {opt.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
