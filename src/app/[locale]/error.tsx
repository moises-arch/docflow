"use client";

import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ error, reset }: Props) {
  const message = error.message?.slice(0, 200) ?? "Error desconocido";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <AlertTriangle size={56} className="text-red-400" />
      <div className="text-center">
        <h1 className="mb-2 text-xl font-semibold text-[var(--color-fg)]">Algo salió mal</h1>
        <p className="text-sm text-[var(--color-fg-mute)]">{message}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-[var(--radius-sm)] bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90"
        >
          Reintentar
        </button>
        <Link
          href="/dashboard"
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-fg-mute)] hover:text-[var(--color-fg)]"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
