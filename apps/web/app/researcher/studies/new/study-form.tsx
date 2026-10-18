"use client";

import {
  TASK_LIBRARY,
  WRITING_POSTURE_TASK,
  clinicalFormForCondition,
  clinicalQuestionsForModule,
  defaultModuleForCondition,
  guideStepsForModule,
  type Cadence,
  type ReportQuestion,
} from "@vf/shared";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, cn } from "@/components/ui";
import { conditionKey } from "@/lib/format";
import type { Condition } from "@/lib/types";
import { createStudy } from "./actions";

const BUILTIN_CONDITIONS: { value: string; label: string }[] = [
  { value: "parkinsons", label: "Parkinson's disease" },
  { value: "focal_hand_dystonia", label: "Focal hand dystonia" },
  { value: "eczema", label: "Atopic dermatitis" },
  { value: "other", label: "Other" },
];

const FOUNDATIONAL_EVALS = [
  { module: "finger_tapping", label: "Finger tapping (video)", conditions: ["parkinsons", "other"] },
  { module: "hand_tremor", label: "Hand tremor (video)", conditions: ["parkinsons", "other"] },
  { module: "eczema_photo", label: "Skin photo (atopic dermatitis)", conditions: ["eczema", "other"] },
] as const;

export type CreatedModuleOption = {
  id: string;
  label: string;
  condition: string;
  description?: string;
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

type EvalRow = {
  module: string;
  cadence: Cadence;
  report_questions: ReportQuestion[];
  instructions: string;
  guide_steps: string[];
};

function defaultsForModule(module: string, created: CreatedModuleOption[]): Pick<EvalRow, "instructions" | "guide_steps" | "cadence" | "report_questions"> {
  const lib = TASK_LIBRARY[module];
  const createdHit = created.find((m) => m.id === module);
  const createdInstructions = createdHit?.description?.trim();
  return {
    cadence: lib?.cadence ?? "weekly",
    report_questions: clinicalQuestionsForModule(module),
    instructions:
      lib?.instructions ??
      (createdInstructions || (createdHit ? WRITING_POSTURE_TASK.instructions : "Follow the capture steps below, then send your recording.")),
    guide_steps: lib?.guide_steps?.length ? [...lib.guide_steps] : guideStepsForModule(module, lib?.media_type ?? "video"),
  };
}

function modulesForCondition(condition: string, created: CreatedModuleOption[]): CreatedModuleOption[] {
  const key = conditionKey(condition);
  if (condition === "other") return created;
  return created.filter((m) => {
    const mk = conditionKey(m.condition);
    return mk === key || mk === condition || m.condition === condition;
  });
}

function defaultEval(condition: Condition, created: CreatedModuleOption[]): EvalRow | null {
  const matched = modulesForCondition(condition, created);
  if (matched.length) {
    const first = matched[0];
    return { module: first.id, ...defaultsForModule(first.id, created) };
  }
  const module = defaultModuleForCondition(condition);
  if (!module) return null;
  return { module, ...defaultsForModule(module, created) };
}

export function StudyForm({ createdModules = [] }: { createdModules?: CreatedModuleOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<Condition>(() => {
    // Prefer a generated condition when Created Modules exist for a non-builtin label.
    const fromCreated = createdModules[0]?.condition?.trim();
    if (fromCreated) return conditionKey(fromCreated) as Condition;
    return "parkinsons";
  });
  const [evals, setEvals] = useState<EvalRow[]>(() => {
    const initial = createdModules[0]?.condition?.trim() ? (conditionKey(createdModules[0].condition) as Condition) : "parkinsons";
    const row = defaultEval(initial, createdModules);
    return row ? [row] : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const taskModules = useMemo(() => new Set(evals.map((e) => e.module)), [evals]);

  const conditionOptions = useMemo(() => {
    const opts = [...BUILTIN_CONDITIONS];
    const seen = new Set(opts.map((o) => o.value));
    for (const m of createdModules) {
      const raw = m.condition?.trim();
      if (!raw) continue;
      const key = conditionKey(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      // Use the researcher’s Generate wording when it isn’t a built-in slug label.
      const builtin = BUILTIN_CONDITIONS.find((b) => b.value === key);
      opts.push({ value: key, label: builtin?.label ?? raw });
    }
    return opts;
  }, [createdModules]);

  const availableEvals = useMemo(() => {
    const key = conditionKey(condition);
    const foundational = FOUNDATIONAL_EVALS.filter((e) => (e.conditions as readonly string[]).includes(key) || condition === "other").map((e) => ({
      module: e.module,
      label: e.label,
    }));
    // Always surface approved Generate modules for this condition (and all of them under "other").
    const created = modulesForCondition(condition, createdModules).map((m) => ({
      module: m.id,
      label: `${m.label} (created)`,
    }));
    // Deduplicate by module id (created wins).
    const byId = new Map<string, { module: string; label: string }>();
    for (const e of foundational) byId.set(e.module, e);
    for (const e of created) byId.set(e.module, e);
    return [...byId.values()];
  }, [condition, createdModules]);

  function setConditionAndDefaults(next: Condition) {
    setCondition(next);
    const row = defaultEval(next, createdModules);
    setEvals(row ? [row] : []);
  }

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStudy({
            name,
            condition,
            evals: evals.map((ev) => ({
              module: ev.module,
              cadence: ev.cadence,
              report_questions: ev.report_questions,
              instructions: ev.instructions,
              guide_steps: ev.guide_steps,
            })),
            reminders: [],
          });
          if (!r.ok) return setError(r.error);
          router.push(`/researcher/studies/${r.id}?tab=participants`);
          router.refresh();
        });
      }}
    >
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
                {conditionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">
              Conditions you type in Generate module appear here after you approve the module.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Required evaluations"
            description="Created modules from Generate show up here for the matching condition. Participants fill the clinical form after a usable capture."
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={availableEvals.length === 0}
                onClick={() => {
                  const next = availableEvals.find((e) => !taskModules.has(e.module));
                  if (next) {
                    setEvals((xs) => [...xs, { module: next.module, ...defaultsForModule(next.module, createdModules) }]);
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {modulesForCondition(condition, createdModules).length === 0 &&
              !FOUNDATIONAL_EVALS.some((e) => (e.conditions as readonly string[]).includes(conditionKey(condition))) && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No evaluations for this condition yet.{" "}
                <a href="/researcher/generate" className="font-medium underline">
                  Generate and approve
                </a>{" "}
                a module first, or pick Parkinson&apos;s / eczema for foundational tests.
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
                      setEvals((xs) => xs.map((x, j) => (j === i ? { module, ...defaultsForModule(module, createdModules) } : x)));
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
                {createdModules.find((m) => m.id === ev.module)?.measurements?.length ? (
                  <p className="text-xs text-slate-500">
                    Measurements from module:{" "}
                    {createdModules
                      .find((m) => m.id === ev.module)!
                      .measurements.map((m) => m.label)
                      .join(" · ")}
                  </p>
                ) : null}

                <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Capture instructions</div>
                    <p className="mb-2 text-xs text-slate-500">Shown to the participant before recording. Edit freely for this study.</p>
                    <textarea
                      className="min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={ev.instructions}
                      onChange={(e) => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-900">Numbered capture steps</div>
                        <p className="text-xs text-slate-500">The checklist on the check-in page (for example how to prop the phone and hold the pen).</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEvals((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, guide_steps: guideStepsForModule(x.module, TASK_LIBRARY[x.module]?.media_type ?? "video") } : x)),
                          )
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reset steps
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {ev.guide_steps.map((step, si) => (
                        <div key={si} className="flex gap-2">
                          <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {si + 1}
                          </span>
                          <input
                            className={input}
                            value={step}
                            onChange={(e) =>
                              setEvals((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, guide_steps: x.guide_steps.map((s, k) => (k === si ? e.target.value : s)) }
                                    : x,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={ev.guide_steps.length <= 1}
                            onClick={() =>
                              setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, guide_steps: x.guide_steps.filter((_, k) => k !== si) } : x)))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={ev.guide_steps.length >= 12}
                        onClick={() => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, guide_steps: [...x.guide_steps, ""] } : x)))}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add step
                      </Button>
                    </div>
                  </div>
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

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create study"}
        </Button>
    </form>
  );
}
