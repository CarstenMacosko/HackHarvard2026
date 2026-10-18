"use client";

/**
 * Callers: apps/web/app/researcher/page.tsx, apps/web/app/researcher/studies/[id]/page.tsx
 * Component: AdherenceChart. No API — client Recharts over weekly rate series.
 * User: "how do i edit this graph i don't like all the data points clustered like this"
 */

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Weekly completion chart (researcher overview + study detail).
 * Edit this file to change colors, dots, margins, or labels.
 * End-of-line name labels were removed — they stacked when many studies hit 100%.
 * Identify series via the legend above and the hover tooltip.
 */
export const SERIES = ["#bf4f3e", "#3a3633", "#4f7cac", "#c9952e", "#5f8f6b", "#8a6aa8", "#a6a39f", "#3f8f99"];
export const CHART = { grid: "#e7e6e4", tick: "#75726e", muted: "#a6a39f" } as const;

const shortWeek = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function seriesColor(k: number) {
  return SERIES[k % SERIES.length];
}

/** Weekly completion rate per study: one line each, legend + hover tooltip. */
export function AdherenceChart({ series }: { series: { name: string; weeks: { week: string; rate: number | null; due: number }[] }[] }) {
  const weeks = series[0]?.weeks ?? [];
  const data = weeks.map((w, i) =>
    Object.fromEntries([["week", w.week], ...series.map((s, k) => [`s${k}`, s.weeks[i].rate === null ? null : Math.round(s.weeks[i].rate! * 100)])]),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
        {series.map((s, k) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: seriesColor(k) }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} />
            <Tooltip
              labelFormatter={(w) => `Week ending ${shortWeek(String(w))}`}
              formatter={(v: number, key: string) => [`${v}%`, series[Number(key.slice(1))]?.name ?? key]}
              contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: CHART.grid }}
            />
            {series.map((s, k) => (
              <Line
                key={s.name}
                dataKey={`s${k}`}
                name={s.name}
                stroke={seriesColor(k)}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
