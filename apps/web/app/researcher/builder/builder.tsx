"use client";

import type { WorkflowDraft } from "@vf/shared";
import { useState, useTransition } from "react";
import { Badge, Card, ValidationBadge } from "@/components/ui";

const EXAMPLES = [
  "Plaque psoriasis: track redness, scaling and affected area on elbows and knees weekly for 6 months after the trial ends.",
  "Essential tremor: track postural hand tremor amplitude twice a week after a dose change.",
  "Vitiligo: monitor repigmentation of facial patches every two weeks.",
];

export function Builder() {
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    setError(null);
    setApproved(false);
    start(async () => {
      const res = await fetch("/api/builder/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = await res.json();
      if (!res.ok) return setError(body.error);
      setDraft(body);
    });
  }

  const counts = draft?.tasks.flatMap((t) => t.measurements).reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.validation_status]: (acc[m.validation_status] ?? 0) + 1 }), {});

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2 h-fit">
        <label className="text-sm font-medium" htmlFor="prompt">What should the study track?</label>
        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setPrompt(e)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200">
              {e.split(":")[0]}
            </button>
          ))}
        </div>
        <button onClick={generate} disabled={pending} className="mt-4 w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Drafting…" : "Draft workflow"}
        </button>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </Card>

      <div className="lg:col-span-3 space-y-4">
        {!draft && <Card><p className="text-sm text-slate-500">The draft appears here. Every proposed measurement is tagged by whether it is validated, reusable but unvalidated, or needs a new model.</p></Card>}
        {draft && (
          <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{draft.condition}</h2>
                <Badge tone={draft.source === "claude" ? "blue" : "slate"}>{draft.source === "claude" ? "Drafted by Claude" : "Offline template"}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{draft.summary}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                {counts && Object.entries(counts).map(([k, n]) => <span key={k}>{n} × <ValidationBadge status={k as never} /></span>)}
              </div>
            </Card>
            {draft.tasks.map((t) => (
              <Card key={t.id}>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.media_type} · {t.cadence.replace("_", " ")} · module {t.module}</div>
                <div className="mt-1 font-semibold">{t.label}</div>
                <p className="mt-2 rounded-lg bg-brand-50 p-3 text-sm text-slate-700">💬 {t.instructions}</p>
                <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Measurements</div>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {t.measurements.map((m) => (
                    <li key={m.name} className="flex items-center justify-between gap-2">
                      <span>{m.label} <span className="text-slate-400">({m.unit})</span></span>
                      <ValidationBadge status={m.validation_status} />
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Quality gate</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(t.quality_criteria).map(([k, v]) => <Badge key={k}>{k} {v}</Badge>)}</div>
                {t.report_questions.length > 0 && (
                  <>
                    <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Patient report</div>
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{t.report_questions.map((q) => <li key={q.key}>{q.prompt}</li>)}</ul>
                  </>
                )}
              </Card>
            ))}
            <Card>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Validation plan</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">{draft.validation_plan.map((s) => <li key={s}>{s}</li>)}</ol>
              <button
                onClick={() => setApproved(true)}
                disabled={approved}
                className="mt-4 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {approved ? "Saved as draft protocol v1 (needs-validation measurements stay inactive)" : "Approve as draft protocol"}
              </button>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
