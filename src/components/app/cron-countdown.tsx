"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/**
 * Muestra un countdown discreto hasta el próximo cron cada N minutos.
 * `intervalMin` debe coincidir con el schedule del cron (ej. 15 para *\/15).
 * Se oculta si faltan más de 10 min (para no ser invasivo).
 */
export function CronCountdown({
  intervalMin = 15,
  label = "Auto-retry",
}: {
  intervalMin?: number;
  label?: string;
}) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  useEffect(() => {
    function calc() {
      const now = new Date();
      const totalSecs = now.getMinutes() * 60 + now.getSeconds();
      const intervalSecs = intervalMin * 60;
      const remaining = intervalSecs - (totalSecs % intervalSecs);
      setSecsLeft(remaining);
    }

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [intervalMin]);

  if (secsLeft === null) return null;

  // Solo mostrar cuando faltan ≤ 5 min (sutil, no distrae cuando queda mucho)
  if (secsLeft > 5 * 60) return null;

  const m = Math.floor(secsLeft / 60);
  const s = secsLeft % 60;
  const timeStr = m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;

  // Pulsa en los últimos 30 segundos
  const urgent = secsLeft <= 30;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] text-[var(--color-fg-subtle)] tabular-nums transition-colors ${
        urgent ? "text-amber-500 dark:text-amber-400" : ""
      }`}
      title={`${label} corre cada ${intervalMin} min`}
    >
      <Timer size={10} className={urgent ? "animate-pulse" : ""} />
      {timeStr}
    </span>
  );
}
