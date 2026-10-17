"use client";

import type { Observation } from "@vf/shared";
import { useMemo, useState } from "react";
import { CartesianGrid, ErrorBar, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ObservationDetail } from "./observation-detail";
import { ReviewActions } from "./review-actions";

const STATUS_COLOR: Record<string, string> = { accepted: "#059669", corrected: "#2f6fde", pending: "#d97706", rejected: "#94a3b8" };

interface Point {
  t: number;
  value: number | null;
  err: number;
  obs: Observation;
}

/** Longitudinal chart per measurement. Each point opens its source observation. Rejected points are excluded from the line. */
export function Timeline({ observations }: { observations: Observation[] }) {
  const names = useMemo(() => observations[0]?.measurements.map((m) => ({ name: m.name, label: m.label, unit: m.unit })) ?? [], [observations]);
  const [metric, setMetric] = useState(names[0]?.name);
  const [selectedId, setSelectedId] = useState<string | null>(observations.at(-1)?.id ?? null);
  const selected = observations.find((o) => o.id === selectedId) ?? null;

  const data: Point[] = observations.map((o) => {
    const m = o.measurements.find((x) => x.name === metric);
    return { t: new Date(o.captured_at).getTime(), value: o.review_status === "rejected" ? null : (m?.value ?? null), err: m?.uncertainty ?? 0, obs: o };
  });
  const unit = names.find((n) => n.name === metric)?.unit ?? "";
  const reportKey = observations[0] ? Object.keys(observations[0].patient_report)[0] : undefined;

  if (!observations.length) return <p className="text-sm text-slate-500">No observations yet.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button
              key={n.name}
              onClick={() => setMetric(n.name)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${metric === n.name ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                tick={{ fontSize: 12, fill: "#64748b" }}
              />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} domain={["auto", "auto"]} unit={unit.length < 4 ? ` ${unit}` : ""} />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                formatter={(v: number, _n, item) => {
                  const p = item.payload as Point;
                  const extra = reportKey ? ` · ${reportKey.replace(/_/g, " ")}: ${p.obs.patient_report[reportKey]}` : "";
                  return [`${v?.toFixed(2)} ${unit}${extra}`, p.obs.review_status];
                }}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke="#2f6fde"
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  if (cx === undefined || cy === undefined || !payload || payload.value === null) return <g key={index} />;
                  const off = payload.obs.patient_report.medication_state === "OFF";
                  const isSel = payload.obs.id === selectedId;
                  return (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={isSel ? 7 : 5}
                      fill={off ? "#fff" : STATUS_COLOR[payload.obs.review_status]}
                      stroke={STATUS_COLOR[payload.obs.review_status]}
                      strokeWidth={isSel ? 3 : 2}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedId(payload.obs.id)}
                    />
                  );
                }}
              >
                <ErrorBar dataKey="err" width={4} stroke="#94a3b8" />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          {Object.entries(STATUS_COLOR).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>
          ))}
          {observations.some((o) => o.patient_report.medication_state) && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-500 bg-white" />medication OFF</span>
          )}
          <span>Error bars = CV uncertainty · rejected results excluded</span>
        </div>
      </div>
      <div className="lg:col-span-2">
        {selected ? (
          <>
            <ObservationDetail o={selected} />
            {selected.review_status === "pending" && <div className="mt-4"><ReviewActions observation={selected} /></div>}
          </>
        ) : (
          <p className="text-sm text-slate-500">Click a point to see its source submission.</p>
        )}
      </div>
    </div>
  );
}
