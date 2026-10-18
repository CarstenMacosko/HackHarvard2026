"use client";

import type { Observation } from "@vf/shared";
import { useMemo, useState } from "react";
import { CartesianGrid, ErrorBar, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "./charts";
import { ObservationDetail } from "./observation-detail";
import { ReviewActions } from "./review-actions";
import { cn } from "./ui";

/** Review state colours (status palette; also named in the legend, never colour alone). */
const STATUS_COLOR: Record<string, string> = { accepted: "#0f8a5f", corrected: "#2a78d6", pending: "#c98500", rejected: CHART.muted };

interface Point {
  t: number;
  value: number | null;
  err: number;
  obs: Observation;
}

/** Longitudinal chart per measurement. Each point opens its source observation. Rejected points are excluded from the line. */
export function Timeline({ observations }: { observations: Observation[] }) {
  const names = useMemo(() => {
    const seen = new Map<string, { name: string; label: string; unit: string }>();
    for (const o of observations) for (const m of o.measurements) if (!seen.has(m.name)) seen.set(m.name, { name: m.name, label: m.label, unit: m.unit });
    return [...seen.values()];
  }, [observations]);
  const [metric, setMetric] = useState(names[0]?.name);
  const [selectedId, setSelectedId] = useState<string | null>(observations.at(-1)?.id ?? null);
  const selected = observations.find((o) => o.id === selectedId) ?? null;

  if (!observations.length) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No observations yet.</p>;

  const data: Point[] = observations
    .filter((o) => o.measurements.some((m) => m.name === metric))
    .map((o) => {
      const m = o.measurements.find((x) => x.name === metric)!;
      return { t: new Date(o.captured_at).getTime(), value: o.review_status === "rejected" ? null : m.value, err: m.uncertainty ?? 0, obs: o };
    });
  const unit = names.find((n) => n.name === metric)?.unit ?? "";
  const reportKey = observations[0] ? Object.keys(observations[0].patient_report)[0] : undefined;
  const hasMedState = observations.some((o) => o.patient_report.medication_state);

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button
              key={n.name}
              onClick={() => setMetric(n.name)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                metric === n.name ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-600 dark:hover:bg-slate-800",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                tick={{ fontSize: 11, fill: CHART.tick }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: CHART.tick }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                formatter={(v: number, _n, item) => {
                  const p = item.payload as Point;
                  const extra = reportKey ? ` · ${reportKey.replace(/_/g, " ")}: ${p.obs.patient_report[reportKey]}` : "";
                  return [`${v?.toFixed(2)} ${unit}${extra}`, p.obs.review_status];
                }}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: CHART.grid }}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke={CHART.tick}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  if (cx === undefined || cy === undefined || !payload || payload.value === null) return <g key={index} />;
                  const off = payload.obs.patient_report.medication_state === "OFF";
                  const isSel = payload.obs.id === selectedId;
                  const color = STATUS_COLOR[payload.obs.review_status];
                  return (
                    <g key={index} style={{ cursor: "pointer" }} onClick={() => setSelectedId(payload.obs.id)}>
                      <circle cx={cx} cy={cy} r={12} fill="transparent" />
                      <circle cx={cx} cy={cy} r={isSel ? 6.5 : 5} fill={off ? "#fff" : color} stroke={isSel ? "#1a1918" : off ? color : "#fff"} strokeWidth={2} />
                    </g>
                  );
                }}
              >
                <ErrorBar dataKey="err" width={4} stroke={CHART.muted} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />
              {k}
            </span>
          ))}
          {hasMedState && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-500 bg-white dark:border-slate-400 dark:bg-slate-900" />
              medication OFF
            </span>
          )}
          <span>Bars: ±CV uncertainty · rejected results are excluded · click a point to open it</span>
        </div>
      </div>
      <div className="xl:col-span-2">
        {selected ? (
          <>
            <ObservationDetail o={selected} compact />
            {selected.review_status === "pending" && (
              <div className="mt-4">
                <ReviewActions observation={selected} />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Click a point to see its source submission.</p>
        )}
      </div>
    </div>
  );
}
