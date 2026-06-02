"use client";

import { useRef, useState, useCallback, type DragEvent, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;
const ACCEPTED_EXT = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls";

interface UploadDropzoneProps {
  onUpload: (files: File[]) => void;
  disabled?: boolean;
  collapsed?: boolean;
}

export function UploadDropzone({ onUpload, disabled, collapsed }: UploadDropzoneProps) {
  const t = useTranslations("inbox");
  const tCommon = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setErrors([]);

      const valid: File[] = [];
      const errs: string[] = [];

      Array.from(fileList).forEach((file) => {
        if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
          errs.push(`${file.name}: ${t("errors.invalidType")}`);
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          errs.push(`${file.name}: ${t("errors.tooLarge")}`);
          return;
        }
        valid.push(file);
      });

      if (errs.length > 0) setErrors(errs);
      if (valid.length > 0) onUpload(valid);
    },
    [onUpload, t],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only clear if leaving the root drop zone, not a child element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      // Reset so the same file can be re-uploaded
      e.target.value = "";
    },
    [processFiles],
  );

  if (collapsed) return null;

  return (
    <div className="border-b border-[var(--color-border)] p-4">
      <input
        ref={inputRef}
        type="file"
        accept={`${ACCEPTED_EXT},${ACCEPTED_MIME.join(",")}`}
        multiple
        className="sr-only"
        onChange={handleInputChange}
        aria-label={t("dropzone.button")}
        tabIndex={-1}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={t("dropzone.title")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-8",
          "rounded-[var(--radius-md)] border border-dashed",
          "transition-colors duration-[120ms]",
          "focus-visible:ring-2 focus-visible:outline-none",
          "focus-visible:ring-[color:var(--color-fg)]/20",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          isDragging
            ? "border-[color:var(--color-blue)] bg-[color:var(--color-blue)]/5"
            : "border-[var(--color-border)] hover:border-[var(--color-border-hv)] hover:bg-[var(--color-surface-mute)]",
        )}
      >
        <Upload
          size={20}
          strokeWidth={1.5}
          className={cn(
            "transition-colors duration-[120ms]",
            isDragging ? "text-[color:var(--color-blue)]" : "text-[var(--color-fg-subtle)]",
          )}
          aria-hidden="true"
        />

        <p className="text-sm text-[var(--color-fg)]">{t("dropzone.title")}</p>
        <p className="text-xs text-[var(--color-fg-mute)]">{t("dropzone.subtitle")}</p>

        <span className="text-xs text-[var(--color-fg-subtle)]">{tCommon("or")}</span>

        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {t("dropzone.button")}
        </Button>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1" role="alert">
          {errors.map((err, i) => (
            <li key={i} className="text-xs text-[color:var(--color-rose)]">
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
