"use client";

import {
  DEFAULT_CONSENT,
  TASK_LIBRARY,
  clinicalFormForCondition,
  clinicalQuestionsForModule,
  defaultModuleForCondition,
  type Cadence,
  type ReportQuestion,
} from "@vf/shared";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, cn } from "@/components/ui";
import type { Condition } from "@/lib/types";
import { createStudy } from "./actions";

const FOUNDATIONAL_EVALS = [
  { module: "finger_tapping", label: "Finger tapping (video)", conditions: ["parkinsons", "other"] },
  { module: "hand_tremor", label: "Hand tremor (video)", conditions: ["parkinsons", "other"] },
  { module: "eczema_photo", label: "Skin photo (atopic dermatitis)", conditions: ["eczema", "other"] },
] as const;

export type CreatedModuleOption = {
  id: string;
  label: string;
  condition: string;
  measurements: { name: string; label: string; unit: string }[];
};

const CADENCES: { id: Cadence; label: string }[] = [
  { id: "twice_daily", label: "Twice daily" },
  { id: "daily", label: "Daily" },
  { id: "twice_weekly", label: "Twice weekly" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every two weeks" },
];

const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

type EvalRow = { module: string; cadence: Cadence; report_questions: ReportQuestion[] };

function defaultEval(condition: Condition, created: CreatedModuleOption[]): EvalRow | null {
  if (condition === "focal_hand_dystonia") {
    const first = created[0];
    if (!first) return null;
    return {
      module: first.id,
      cadence: "weekly",
      report_questions: clinicalQuestionsForModule(first.id),
    };
  }
  const module = defaultModuleForCondition(condition);
  if (!module) return null;
  return {
    module,
    cadence: TASK_LIBRARY[module]?.cadence ?? "weekly",
    report_questions: clinicalQuestionsForModule(module),
  };
}

export function StudyForm({ createdModules = [] }: { createdModules?: CreatedModuleOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<Condition>("parkinsons");
  const [consentTitle, setConsentTitle] = useState(DEFAULT_CONSENT.title);
  const [consentBody, setConsentBody] = useState(DEFAULT_CONSENT.body);
  const [evals, setEvals] = useState<EvalRow[]>(() => {
    const row = defaultEval("parkinsons", createdModules);
    return row ? [row] : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const taskModules = useMemo(() => new Set(evals.map((e) => e.module)), [evals]);
  const formMeta = clinicalFormForCondition(condition);
  const availableEvals = useMemo(() => {
    const foundational = FOUNDATIONAL_EVALS.filter((e) => (e.conditions as readonly string[]).includes(condition)).map((e) => ({
      module: e.module,
      label: e.label,
    }));
    const created = createdModules
      .filter((m) => condition === "focal_hand_dystonia" || condition === "other" || m.condition.toLowerCase().includes("dystonia"))
      .map((m) => ({ module: m.id, label: `${m.label} (created)` }));
    return [...foundational, ...created];
  }, [condition, createdModules]);

  function setConditionAndDefaults(next: Condition) {
    setCondition(next);
    const row = defaultEval(next, createdModules);
    setEvals(row ? [row] : []);
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStudy({
            name,
            condition,
            consentTitle,
            consentBody,
            evals: evals.map((ev) => ({ module: ev.module, cadence: ev.cadence, report_questions: ev.report_questions })),
            reminders: [],
          });
          if (!r.ok) return setError(r.error);
          router.push(`/researcher/studies/${r.id}?tab=participants`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader title="Study" description="Created as active so you can enroll someone immediately." />
          <CardBody className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Name
              <input className={cn(input, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder="PD-FOLLOW: post-visit motor checks" required />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Condition
              <select className={cn(input, "mt-1")} value={condition} onChange={(e) => setConditionAndDefaults(e.target.value as Condition)}>
                <option value="parkinsons">Parkinson&apos;s disease</option>
                <option value="focal_hand_dystonia">Focal hand dystonia</option>
                <option value="eczema">Atopic dermatitis</option>
                <option value="other">Other</option>
              </select>
            </label>
            <p className="text-xs text-slate-500">
              CV module and clinical questionnaire default to this condition ({formMeta.name}).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consent form" description="Shown on the join link during enrollment." />
          <CardBody className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Title
              <input className={cn(input, "mt-1")} value={consentTitle} onChange={(e) => setConsentTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Body
              <textarea className="mt-1 min-h-[220px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-relaxed" value={consentBody} onChange={(e) => setConsentBody(e.target.value)} />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Required evaluations"
            description="Each evaluation uses its condition-specific CV module. Participants fill the clinical form after a usable capture."
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={availableEvals.length === 0}
                onClick={() => {
                  const next = availableEvals.find((e) => !taskModules.has(e.module));
                  if (next) {
                    setEvals((xs) => [
                      ...xs,
                      {
                        module: next.module,
                        cadence: TASK_LIBRARY[next.module]?.cadence ?? "weekly",
                        report_questions: clinicalQuestionsForModule(next.module),
                      },
                    ]);
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {condition === "focal_hand_dystonia" && createdModules.length === 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No created modules yet.{" "}
                <a href="/researcher/generate" className="font-medium underline">
                  Generate and approve
                </a>{" "}
                a writing-posture module for focal hand dystonia first.
              </p>
            )}
            {evals.map((ev, i) => (
              <div key={`${ev.module}-${i}`} className="space-y-3 rounded-md bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={cn(input, "max-w-xs")}
                    value={ev.module}
                    onChange={(e) => {
                      const module = e.target.value;
                      setEvals((xs) =>
                        xs.map((x, j) =>
                          j === i
                            ? { module, cadence: TASK_LIBRARY[module]?.cadence ?? x.cadence, report_questions: clinicalQuestionsForModule(module) }
                            : x,
                        ),
                      );
                    }}
                  >
                    {availableEvals.map((opt) => (
                      <option key={opt.module} value={opt.module}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select className={cn(input, "w-44")} value={ev.cadence} onChange={(e) => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, cadence: e.target.value as Cadence } : x)))}>
                    {CADENCES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="ghost" disabled={evals.length === 1} onClick={() => setEvals((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Post-capture clinical form</div>
                      <p className="text-xs text-slate-500">
                        Default:{" "}
                        {
                          clinicalFormForCondition(
                            condition === "other"
                              ? ev.module === "eczema_photo"
                                ? "eczema"
                                : ev.module.startsWith("gen_")
                                  ? "focal_hand_dystonia"
                                  : "parkinsons"
                              : condition,
                          ).name
                        }
                        .{" "}
                        <span className="text-slate-400">
                          {
                            clinicalFormForCondition(
                              condition === "other"
                                ? ev.module === "eczema_photo"
                                  ? "eczema"
                                  : ev.module.startsWith("gen_")
                                    ? "focal_hand_dystonia"
                                    : "parkinsons"
                                : condition,
                            ).citation
                          }
                        </span>
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, report_questions: clinicalQuestionsForModule(x.module) } : x)))}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reset to clinical default
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {ev.report_questions.map((q, qi) => (
                      <div key={`${q.key}-${qi}`} className="grid gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_auto]">
                        <input
                          className={input}
                          value={q.prompt}
                          onChange={(e) =>
                            setEvals((xs) =>
                              xs.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      report_questions: x.report_questions.map((qq, k) => (k === qi ? { ...qq, prompt: e.target.value } : qq)),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        <div className="flex items-center gap-2">
                          <select
                            className={cn(input, "w-28")}
                            value={q.type}
                            onChange={(e) =>
                              setEvals((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        report_questions: x.report_questions.map((qq, k) =>
                                          k === qi ? { ...qq, type: e.target.value as ReportQuestion["type"], options: e.target.value === "choice" ? qq.options ?? ["Yes", "No"] : undefined } : qq,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="choice">Choice</option>
                            <option value="scale">0–10 scale</option>
                            <option value="text">Text</option>
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, report_questions: x.report_questions.filter((_, k) => k !== qi) } : x)))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {q.type === "choice" && (
                          <input
                            className={cn(input, "sm:col-span-2")}
                            value={(q.options ?? []).join(" | ")}
                            onChange={(e) =>
                              setEvals((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        report_questions: x.report_questions.map((qq, k) =>
                                          k === qi
                                            ? {
                                                ...qq,
                                                options: e.target.value
                                                  .split("|")
                                                  .map((s) => s.trim())
                                                  .filter(Boolean),
                                              }
                                            : qq,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Options separated by |"
                          />
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setEvals((xs) =>
                          xs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  report_questions: [
                                    ...x.report_questions,
                                    { key: `custom_${Date.now().toString(36)}`, prompt: "New question", type: "text" as const },
                                  ],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Add question
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Clinical form defaults" description={formMeta.summary} />
          <CardBody className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-900">{formMeta.name}</span>
            </p>
            <p className="text-xs text-slate-500">{formMeta.citation}</p>
            <p>Participants complete this questionnaire after a usable video or photo. Edit prompts above; reset restores the verified default.</p>
          </CardBody>
        </Card>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create study"}
        </Button>
      </div>
    </form>
  );
}
