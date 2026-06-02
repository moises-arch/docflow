"use client";

import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ReviewError({ error, reset }: Props) {
  const message = error.message?.slice(0, 200) ?? "Error desconocido";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <div className="mb-4 flex justify-center">
          <AlertTriangle size={40} className="text-red-400" />
        </div>
        <h1 className="mb-2 text-lg font-semibold text-[var(--color-fg)]">
          Error al cargar el documento
        </h1>
        <p className="mb-6 text-sm text-[var(--color-fg-mute)]">{message}</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90"
          >
            Reintentar
          </button>
          <Link
            href="/inbox"
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
          >
            Volver al inbox
          </Link>
        </div>
      </div>
    </div>
  );
}
