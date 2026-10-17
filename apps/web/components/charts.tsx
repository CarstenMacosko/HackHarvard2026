"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Categorical slots 1–2 of the validated reference palette (dataviz skill), in fixed order. */
export const SERIES = ["#2a78d6", "#eb6834"];

const shortWeek = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Weekly completion rate per study: one line each, legend + direct end labels, hover tooltip. */
export function AdherenceChart({ series }: { series: { name: string; weeks: { week: string; rate: number | null; due: number }[] }[] }) {
  const weeks = series[0]?.weeks ?? [];
  const data = weeks.map((w, i) => Object.fromEntries([["week", w.week], ...series.map((s, k) => [`s${k}`, s.weeks[i].rate === null ? null : Math.round(s.weeks[i].rate! * 100)])]));
  // nudge direct labels apart when two series end at nearly the same value
  const last = series.map((_, k) => data.at(-1)?.[`s${k}`] as number | null | undefined);
  const labelDy = last.map((v, k) => (k > 0 && v != null && last.slice(0, k).some((u) => u != null && Math.abs(u - v) < 8) ? 14 * k : 0));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        {series.map((s, k) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[k] }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 104, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <Tooltip
              labelFormatter={(w) => `Week ending ${shortWeek(String(w))}`}
              formatter={(v: number, key: string) => [`${v}%`, series[Number(key.slice(1))]?.name ?? key]}
              contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: "#e2e8f0" }}
            />
            {series.map((s, k) => (
              <Line
                key={s.name}
                dataKey={`s${k}`}
                name={s.name}
                stroke={SERIES[k]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
                label={(p: { index?: number; x?: number; y?: number; value?: number }) =>
                  p.index === data.length - 1 && p.value !== null && p.value !== undefined ? (
                    <text key={`l${k}`} x={(p.x ?? 0) + 8} y={(p.y ?? 0) + 4 + labelDy[k]} fontSize={11} fill="#334155">
                      {s.name.split(":")[0]} {p.value}%
                    </text>
                  ) : (
                    <g key={`n${k}-${p.index}`} />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
