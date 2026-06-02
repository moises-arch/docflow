"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DataPoint = { month: string; revenue: number; orders: number };

export function FinancialsCharts({ data }: { data: DataPoint[] }) {
  return (
    <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="mb-3 text-sm font-semibold">Revenue mensual (últimos 12 meses)</h2>
      {data.length === 0 ? (
        <div className="p-12 text-center text-xs text-[var(--color-fg-mute)]">
          Sin datos suficientes para mostrar tendencia.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="month"
              fontSize={10}
              tickFormatter={(v: string) => v.slice(5)}
              stroke="var(--color-fg-mute)"
            />
            <YAxis
              fontSize={10}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              stroke="var(--color-fg-mute)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
              formatter={(v) => [
                `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                "Revenue",
              ]}
            />
            <Bar dataKey="revenue" fill="#0071ce" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
