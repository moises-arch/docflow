import { Server, Cloud } from "lucide-react";

type Props = {
  remote: boolean;
  host: string | null;
  /** "badge" = chip compacto; "card" = tarjeta con detalle. */
  variant?: "badge" | "card";
  className?: string;
};

/**
 * Indicador del motor de navegador que usan los runners (Supplier Portal/Supplier Portal).
 * Muestra explícitamente si el scraping corre en el VPS remoto o en serverless.
 * Server-safe: no usa hooks ni estado.
 */
export function BrowserEngineBadge({ remote, host, variant = "badge", className = "" }: Props) {
  const Icon = remote ? Server : Cloud;
  const accent = remote ? "#10b981" : "#f59e0b";
  const title = remote ? "Navegador en VPS" : "Navegador serverless";
  const detail = remote ? host ?? "VPS remoto" : "Chromium en Vercel";

  if (variant === "card") {
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 ${className}`}
      >
        <div
          className="flex size-9 items-center justify-center rounded-lg"
          style={{ background: `${accent}20`, color: accent }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--color-fg)]">{title}</div>
          <div className="truncate font-mono text-xs text-[var(--color-fg-mute)]">{detail}</div>
        </div>
        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <span className="inline-block size-1.5 rounded-full" style={{ background: accent }} />
          {remote ? "Remoto" : "Local"}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      style={{ background: `${accent}1a`, color: accent }}
      title={`${title} — ${detail}`}
    >
      <Icon size={12} />
      {remote ? (host ?? "VPS") : "Serverless"}
    </span>
  );
}
