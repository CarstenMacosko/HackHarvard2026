import type { Observation } from "@vf/shared";
import { CHECK_LABEL, dateTime } from "@/lib/format";
import { Badge, KeyValues, REVIEW_TONE, SectionLabel, ValidationBadge } from "./ui";

/** Everything behind one graphed value: source media, quality checks, measurements, report, provenance. */
export function ObservationDetail({ o, compact = false }: { o: Observation; compact?: boolean }) {
  const runtime = String(o.context.analysis_runtime ?? "server");
  const attempts = Number(o.context.attempts ?? 1);
  const isVideo = (o.module === "finger_tapping" || o.module === "hand_tremor") && o.context.media_kind !== "poster";
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={REVIEW_TONE[o.review_status]}>{o.review_status}</Badge>
        <span className="text-slate-600">{dateTime(o.captured_at)}</span>
        <span className="text-slate-400">· {o.task_label}</span>
      </div>

      <div
        className={
          o.media_url
            ? "relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-900"
            : "flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-xs text-slate-500"
        }
      >
        {o.media_url ? (
          isVideo ? (
            <video src={o.media_url} controls playsInline className="h-full w-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.media_url} alt={`${o.task_label}, ${dateTime(o.captured_at)}`} className="h-full w-full object-contain" />
          )
        ) : (
          <span className="px-6 text-center">Source media for submission {o.submission_id}. This is a synthetic record, so no file is stored.</span>
        )}
        {o.context.media_kind === "poster" && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Still frame (video analysed on-device)</span>}
      </div>

      <div>
        <SectionLabel>Measurements</SectionLabel>
        <table className="w-full">
          <tbody>
            {o.measurements.map((m) => (
              <tr key={m.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2 text-slate-700">{m.label}</td>
                <td className="tabular py-1.5 text-right font-medium text-slate-900">
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
            <Badge key={c.name} tone={c.passed ? "green" : "red"}>
              {c.passed ? "✓" : "✗"} {CHECK_LABEL[c.name] ?? c.name}
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
              ["Source", o.context.source === "web" ? "Web upload" : "Messaging (Photon)"],
              ...(o.reviewer ? ([["Reviewer", o.reviewer]] as [string, string][]) : []),
            ]}
          />
        </div>
      </div>
      {o.review_note && <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">Review note: {o.review_note}</p>}
    </div>
  );
}
