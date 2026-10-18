"use client";

import type { Observation } from "@vf/shared";
import { CHECK_LABEL, dateTime } from "@/lib/format";
import { ObservationNotes } from "./observation-notes";
import { Badge, KeyValues, SectionLabel, ValidationBadge } from "./ui";
import { VideoReplay } from "./video-replay";

const isHandVideoModule = (module: string) =>
  module === "finger_tapping" || module === "hand_tremor" || module === "writing_posture" || module.startsWith("gen_");

/** Everything behind one graphed value: source media, quality checks, measurements, report, provenance. */
export function ObservationDetail({ o, compact = false }: { o: Observation; compact?: boolean }) {
  const runtime = String(o.context.analysis_runtime ?? "server");
  const attempts = Number(o.context.attempts ?? 1);
  const isVideo = isHandVideoModule(o.module) && o.context.media_kind !== "poster";
  const trimStart = typeof o.context.trim_start_s === "number" ? o.context.trim_start_s : 0;
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600 dark:text-slate-400">{dateTime(o.captured_at)}</span>
        <span className="text-slate-400">· {o.task_label}</span>
      </div>

      {o.media_url ? (
        isVideo ? (
          <VideoReplay src={o.media_url} trimStartS={trimStart} module={o.module} measurements={o.measurements} />
        ) : (
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.media_url} alt={`${o.task_label}, ${dateTime(o.captured_at)}`} className="h-full w-full object-contain" />
          </div>
        )
      ) : (
        <div className="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
          <span className="px-6 text-center">No media file was kept for submission {o.submission_id}.</span>
        </div>
      )}

      <div>
        <SectionLabel>Measurements</SectionLabel>
        <table className="w-full">
          <tbody>
            {o.measurements.map((m) => (
              <tr key={m.name} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{m.label}</td>
                <td className="tabular py-1.5 text-right font-medium text-slate-900 dark:text-slate-100">
                  {m.value.toFixed(2)}
                  {m.uncertainty !== null && <span className="font-normal text-slate-400"> ± {m.uncertainty.toFixed(2)}</span>}
                  <span className="ml-1 text-xs font-normal text-slate-400">{m.unit}</span>
                </td>
                <td className="py-1.5 pl-3 text-right">
                  <ValidationBadge status={m.validation_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <SectionLabel>
          Quality gate · accepted on attempt {attempts}
        </SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {o.quality.checks.map((c) => (
            <Badge key={c.name} tone={c.passed ? "green" : c.advisory ? "amber" : "red"}>
              {c.passed ? "✓" : c.advisory ? "!" : "✗"} {CHECK_LABEL[c.name] ?? c.name}
              {!c.passed && c.advisory && <span className="font-normal">(low, accepted)</span>}
              {c.value !== null && <span className="tabular font-normal opacity-75">{Number(c.value.toFixed(2))}</span>}
            </Badge>
          ))}
        </div>
      </div>

      <div className={compact ? "space-y-5" : "grid gap-5 sm:grid-cols-2"}>
        <div>
          <SectionLabel>Patient report</SectionLabel>
          <KeyValues items={Object.entries(o.patient_report).map(([k, v]) => [k.replace(/_/g, " "), String(v)])} />
        </div>
        <div>
          <SectionLabel>Provenance</SectionLabel>
          <KeyValues
            items={[
              ["Model", <span key="m" className="font-mono text-xs">{o.model_version}</span>],
              ["Analysed", runtime === "on-device" ? "On-device (browser)" : "CV service"],
              ["Source", o.context.source === "web" ? "Web upload" : "Upload"],
              ...(o.reviewer ? ([["Reviewer", o.reviewer]] as [string, string][]) : []),
            ]}
          />
        </div>
      </div>
      {o.review_note && <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-900 dark:text-slate-400">Review note: {o.review_note}</p>}
      {!compact && <ObservationNotes observationId={o.id} />}
    </div>
  );
}
