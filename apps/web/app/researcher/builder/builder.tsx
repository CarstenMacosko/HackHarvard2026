"use client";

import type { ValidationStatus, WorkflowDraft } from "@vf/shared";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { DroidGenerate } from "@/components/droid";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, SectionLabel, ValidationBadge } from "@/components/ui";

const EXAMPLES = [
  "Plaque psoriasis: track redness, scaling and affected area on elbows and knees weekly for 6 months after the trial ends.",
  "Essential tremor: track postural hand tremor amplitude twice a week after a dose change.",
  "Vitiligo: monitor repigmentation of facial patches every two weeks.",
];

export function Builder() {
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [draft, setDraft] = useState<(WorkflowDraft & { draft_id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<string | null>(null); // the study created from the draft
  const [pending, start] = useTransition();
  const [approving, startApprove] = useTransition();

  function generate() {
    setError(null);
    setApproved(null);
    start(async () => {
      const res = await fetch("/api/builder/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = await res.json();
      if (!res.ok) return setError(body.error);
      setDraft(body);
    });
  }

  function approve() {
    if (!draft?.draft_id) return;
    setError(null);
    startApprove(async () => {
      const res = await fetch("/api/builder/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft_id: draft.draft_id }) });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Could not save the protocol.");
      setApproved(body.study_id);
    });
  }

  const counts = draft?.tasks
    .flatMap((t) => t.measurements)
    .reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.validation_status]: (acc[m.validation_status] ?? 0) + 1 }), {});

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card className="h-fit">
        <CardHeader title="What should the study track?" />
        <CardBody className="space-y-3">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="w-full rounded-md border border-slate-300 p-3 text-sm" aria-label="Condition description" />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setPrompt(e)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200">
                {e.split(":")[0]}
              </button>
            ))}
          </div>
          <Button onClick={generate} disabled={pending} className="w-full">
            <Sparkles className="h-4 w-4" /> {pending ? "Drafting…" : "Draft workflow"}
          </Button>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <p className="text-xs text-slate-500">
            The model only drafts wording and picks components. Whether a measurement is validated, reusable-but-unvalidated, or needs a new model is decided by the component catalog, not by the LLM.
          </p>
        </CardBody>
      </Card>

      <div className="space-y-6">
        {!draft && (
          <Card>
            <EmptyState title="No draft yet">The draft appears here, with every proposed measurement tagged by its validation status.</EmptyState>
          </Card>
        )}
        {draft && (
          <>
            <Card>
              <CardHeader title={draft.condition} actions={<Badge tone={draft.source === "claude" ? "blue" : "slate"}>{draft.source === "claude" ? "Drafted by Claude" : "Offline template"}</Badge>} />
              <CardBody>
                <p className="text-sm text-slate-600">{draft.summary}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                  {counts &&
                    Object.entries(counts).map(([k, n]) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="tabular font-medium">{n}×</span> <ValidationBadge status={k as ValidationStatus} />
                      </span>
                    ))}
                </div>
              </CardBody>
            </Card>
            {draft.tasks.map((t) => (
              <Card key={t.id}>
                <CardHeader title={t.label} description={`${t.media_type} · ${t.cadence.replace("_", " ")} · module ${t.module}`} />
                <CardBody className="space-y-4">
                  <div>
                    <SectionLabel>Message to participants</SectionLabel>
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{t.instructions}</p>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <SectionLabel>Measurements</SectionLabel>
                      <ul className="space-y-1.5 text-sm">
                        {t.measurements.map((m) => (
                          <li key={m.name}>
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                {m.label} <span className="text-slate-400">({m.unit})</span>
                              </span>
                              <ValidationBadge status={m.validation_status} />
                            </div>
                            {m.validation_status === "new_model_required" && <DroidGenerate condition={draft.condition} task={t} measurement={m} description={prompt} />}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <SectionLabel>Quality gate</SectionLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(t.quality_criteria).map(([k, v]) => (
                          <Badge key={k}>
                            {k} {v}
                          </Badge>
                        ))}
                      </div>
                      {t.report_questions.length > 0 && (
                        <>
                          <div className="mt-4">
                            <SectionLabel>Patient report</SectionLabel>
                          </div>
                          <ul className="list-disc pl-5 text-sm text-slate-600">
                            {t.report_questions.map((q) => (
                              <li key={q.key}>{q.prompt}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
            <Card>
              <CardHeader title="Validation plan" />
              <CardBody>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  {draft.validation_plan.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {approved ? (
                    <ButtonLink href={`/researcher/studies/${approved}`} variant="success">
                      Saved as draft protocol v1: open the study
                    </ButtonLink>
                  ) : (
                    <Button variant="success" onClick={approve} disabled={approving || !draft.draft_id}>
                      {approving ? "Saving…" : "Approve as draft protocol"}
                    </Button>
                  )}
                  <ButtonLink href="/researcher/generate" variant="secondary">
                    Review writing module generator
                  </ButtonLink>
                </div>
                {approved && <p className="mt-2 text-xs text-slate-500">Measurements tagged “needs validation” or “needs new model” stay inactive until a trained, validated model is registered for them.</p>}
                <p className="mt-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Generate with Droid</span> drafts a source candidate. The current track evaluator supports index-finger straightening; other measurements need their own test tracks. Candidate jobs do not become trained models or active modules.
                </p>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
