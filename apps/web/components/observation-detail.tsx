import type { Observation } from "@vf/shared";
import { Badge, REVIEW_TONE, ValidationBadge } from "./ui";

/** Everything behind one graphed value: source media, quality checks, measurements, report, provenance. */
export function ObservationDetail({ o }: { o: Observation }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={REVIEW_TONE[o.review_status]}>{o.review_status}</Badge>
        <span className="text-slate-500">{new Date(o.captured_at).toLocaleString()}</span>
        <span className="text-slate-400">· {o.task_label}</span>
      </div>

      <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-300">
        {o.media_url ? (
          o.module === "finger_tapping" ? (
            <video src={o.media_url} controls className="h-full w-full rounded-lg object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.media_url} alt={o.task_label} className="h-full w-full rounded-lg object-contain" />
          )
        ) : (
          <span>Source media · submission {o.submission_id} (synthetic record, no file)</span>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Measurements</div>
        <table className="w-full">
          <tbody>
            {o.measurements.map((m) => (
              <tr key={m.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5">{m.label}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {m.value.toFixed(2)}
                  {m.uncertainty !== null && <span className="font-normal text-slate-400"> ± {m.uncertainty.toFixed(2)}</span>}
                  <span className="ml-1 text-xs font-normal text-slate-400">{m.unit}</span>
                </td>
                <td className="py-1.5 pl-3 text-right"><ValidationBadge status={m.validation_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Why it was accepted ({Number(o.context.attempts ?? 1)} attempt{Number(o.context.attempts ?? 1) > 1 ? "s" : ""})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {o.quality.checks.map((c) => (
            <Badge key={c.name} tone={c.passed ? "green" : "red"}>
              {c.passed ? "✓" : "✗"} {c.name} {c.value !== null ? Number(c.value.toFixed(2)) : ""}
              {c.threshold !== null ? ` / ${c.threshold}` : ""}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Patient report</div>
          <dl className="space-y-0.5">
            {Object.entries(o.patient_report).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-slate-500">{k.replace(/_/g, " ")}</dt><dd className="font-medium">{String(v)}</dd></div>
            ))}
          </dl>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Provenance</div>
          <dl className="space-y-0.5">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">model</dt><dd className="font-mono text-xs">{o.model_version}</dd></div>
            {Object.entries(o.context).filter(([k]) => k !== "attempts").map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd>{String(v)}</dd></div>
            ))}
            {o.reviewer && <div className="flex justify-between gap-2"><dt className="text-slate-500">reviewer</dt><dd>{o.reviewer}</dd></div>}
          </dl>
        </div>
      </div>
      {o.review_note && <p className="rounded-lg bg-slate-50 p-3 text-slate-600">Review note: {o.review_note}</p>}
    </div>
  );
}
