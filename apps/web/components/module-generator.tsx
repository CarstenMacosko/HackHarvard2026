"use client";

import { Bot, Boxes, CheckCircle2, FlaskConical, Loader2, MessageSquare, Play, Plus, Server, Sparkles, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, CardBody, CardHeader, cn } from "@/components/ui";
import type { DaytonaExperiment, GenerationProgress, GenerationStep } from "@/lib/generation-types";

const STEPS: { id: GenerationStep; label: string }[] = [
  { id: "queued", label: "Queued" },
  { id: "inspecting", label: "Inspect modules" },
  { id: "drafting", label: "Droid draft" },
  { id: "daytona_experiments", label: "Daytona experiments" },
  { id: "iterating", label: "Iterate fixes" },
  { id: "validating", label: "Validate" },
  { id: "ready", label: "Candidate ready" },
  { id: "approved", label: "Approved" },
];

/** Suggested starter metrics for the FHD writing demo — optional, not locked. */
const SUGGESTED = [
  {
    name: "index_straight_fraction",
    label: "Index finger straight during writing",
    unit: "fraction",
    hint: "Share of writing frames where index PIP ≥ 160°.",
  },
  {
    name: "index_pip_angle_deg",
    label: "Mean index PIP angle during writing",
    unit: "degrees",
    hint: "Average index PIP joint angle while writing.",
  },
] as const;

type Meas = { name: string; label: string; unit: string };

type DesignMsg = { role: "researcher" | "droid"; text: string; at: string };

type AssessResult = {
  verdict: "feasible" | "needs_revision" | "impossible";
  summary: string;
  advice: string;
  can_accept: boolean;
  revised_measurements?: Meas[];
  measurements?: { name: string; verdict: string; advice: string; suggested?: Meas }[];
  mode?: string;
};

const DEMO_PRESET = {
  condition: "Focal hand dystonia",
  moduleName: "Writing posture (focal hand dystonia)",
  description:
    "With a fixed side-view camera, hold a pen for two seconds, then write the same short phrase. Measure index-finger posture from hand landmarks.",
  measurements: SUGGESTED.map((m) => ({ name: m.name, label: m.label, unit: m.unit })) as Meas[],
};

function stepIndex(step: GenerationStep): number {
  if (step === "failed") return -1;
  return STEPS.findIndex((s) => s.id === step);
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "custom_metric"
  );
}

function ExperimentCell({ exp }: { exp: DaytonaExperiment }) {
  const tone =
    exp.status === "passed" ? "bg-emerald-500" : exp.status === "failed" ? "bg-rose-400" : exp.status === "running" ? "bg-sky-500 animate-pulse" : "bg-slate-200";
  return (
    <div
      className={cn("group relative aspect-square rounded-md ring-1 ring-inset ring-slate-200/80 dark:ring-slate-600/80", tone)}
      title={`${exp.label}: ${exp.status}${exp.metrics ? ` · ${exp.metrics.passed_cases}/${exp.metrics.total_cases} ${exp.metrics.fixture_source} track checks · ${exp.metrics.accepted_cases} accepted` : ""}`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white/90 drop-shadow">{exp.id}</span>
    </div>
  );
}

function Pipeline({ progress }: { progress: GenerationProgress }) {
  const idx = stepIndex(progress.step);
  const failed = progress.step === "failed";
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.filter((s) => s.id !== "failed").map((s, i) => {
        const done = !failed && idx > i;
        const active = !failed && idx === i;
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              done && "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/30",
              active && "bg-sky-50 text-sky-900 ring-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-500/40",
              !done && !active && "bg-white text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-600",
              failed && i <= Math.max(idx, 0) && "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-400/30",
            )}
          >
            {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5 rounded-full bg-current opacity-20" />}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

export function ModuleGenerator() {
  const router = useRouter();
  const [condition, setCondition] = useState(DEMO_PRESET.condition);
  const [moduleName, setModuleName] = useState(DEMO_PRESET.moduleName);
  const [description, setDescription] = useState(DEMO_PRESET.description);
  const [measurements, setMeasurements] = useState<Meas[]>([...DEMO_PRESET.measurements]);
  const [customLabel, setCustomLabel] = useState("");
  const [customUnit, setCustomUnit] = useState("fraction");
  const [designNote, setDesignNote] = useState("");
  const [thread, setThread] = useState<DesignMsg[]>([]);
  const [assess, setAssess] = useState<AssessResult | null>(null);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [assessing, startAssess] = useTransition();
  const [reviewing, startReview] = useTransition();
  const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  function invalidatePlan() {
    setPlanAccepted(false);
    setAssess(null);
  }

  function resetForm() {
    setCondition(DEMO_PRESET.condition);
    setModuleName(DEMO_PRESET.moduleName);
    setDescription(DEMO_PRESET.description);
    setMeasurements([...DEMO_PRESET.measurements]);
    setCustomLabel("");
    setCustomUnit("fraction");
    setDesignNote("");
    setThread([]);
    setAssess(null);
    setPlanAccepted(false);
    setJobId(null);
    setProgress(null);
    setError(null);
  }

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/droid/generate/${id}`, { cache: "no-store" });
    const body = await res.json();
    if (res.status === 404) throw new Error("Job not found yet — retrying…");
    if (!res.ok) throw new Error(body.error ?? "Could not load job");
    setProgress(body.job.progress ?? null);
    return body.job as { status: string; progress: GenerationProgress | null };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await poll(jobId);
        if (cancelled) return;
      } catch {
        /* ignore transient */
      }
    };
    void tick();
    const t = setInterval(tick, 900);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [jobId, poll]);

  const passed = useMemo(() => progress?.experiments.filter((e) => e.status === "passed").length ?? 0, [progress]);
  const failed = useMemo(() => progress?.experiments.filter((e) => e.status === "failed").length ?? 0, [progress]);
  const running = useMemo(() => progress?.experiments.filter((e) => e.status === "running").length ?? 0, [progress]);

  function toggleSuggested(m: (typeof SUGGESTED)[number]) {
    invalidatePlan();
    setMeasurements((xs) => {
      const on = xs.some((x) => x.name === m.name);
      if (on) return xs.filter((x) => x.name !== m.name);
      return [...xs, { name: m.name, label: m.label, unit: m.unit }];
    });
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const name = slugify(label);
    if (measurements.some((m) => m.name === name)) {
      setError(`Measurement “${name}” is already in the plan.`);
      return;
    }
    invalidatePlan();
    setMeasurements((xs) => [...xs, { name, label, unit: customUnit.trim() || "fraction" }]);
    setCustomLabel("");
    setError(null);
  }

  function askDroid() {
    setError(null);
    if (!measurements.length) {
      setError("Add at least one measurement before asking Droid.");
      return;
    }
    startAssess(async () => {
      const note = designNote.trim();
      const nextThread = note
        ? [...thread, { role: "researcher" as const, text: note, at: new Date().toISOString() }]
        : thread;
      const res = await fetch("/api/droid/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          condition,
          description,
          measurements,
          message: note || undefined,
          history: nextThread,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not assess plan");
        return;
      }
      const result = body as AssessResult;
      setAssess(result);
      setPlanAccepted(false);
      setDesignNote("");
      setThread([
        ...nextThread,
        { role: "droid", text: result.advice || result.summary, at: new Date().toISOString() },
      ]);
    });
  }

  function applyRevised() {
    if (!assess?.revised_measurements?.length) return;
    invalidatePlan();
    setMeasurements(assess.revised_measurements);
    setDesignNote("Applied your suggested measurement rewrites — please re-assess.");
  }

  function acceptPlan(force = false) {
    if (!assess) return;
    if (!force && !assess.can_accept) return;
    setPlanAccepted(true);
    setError(null);
  }

  function startJob() {
    setError(null);
    setProgress(null);
    if (!planAccepted) {
      setError("Ask Droid to assess the plan, then accept it (or revise and re-assess) before generating.");
      return;
    }
    start(async () => {
      const res = await fetch("/api/droid/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          condition,
          name: moduleName.trim() || DEMO_PRESET.moduleName,
          description,
          measurements,
          media_type: "video",
          plan_accepted: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not start generation");
        return;
      }
      setJobId(body.job_id);
    });
  }

  function review() {
    if (!jobId) return;
    startReview(async () => {
      const res = await fetch(`/api/droid/generate/${jobId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Approve failed");
        return;
      }
      await poll(jobId);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
      <Card className="h-fit">
        <CardHeader
          title="Design a CV module"
          description="Propose measurements, get Droid’s feasibility advice, accept a plan, then generate. Suggested writing metrics are optional starters."
        />
        <CardBody className="space-y-4">
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Condition
            <input
              className={cn(input, "mt-1")}
              value={condition}
              onChange={(e) => {
                invalidatePlan();
                setCondition(e.target.value);
              }}
            />
          </label>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Module name
            <input
              className={cn(input, "mt-1")}
              value={moduleName}
              onChange={(e) => {
                invalidatePlan();
                setModuleName(e.target.value);
              }}
              placeholder="Writing posture (focal hand dystonia)"
            />
          </label>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Assessment description
            <textarea
              className="mt-1 min-h-[100px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              value={description}
              onChange={(e) => {
                invalidatePlan();
                setDescription(e.target.value);
              }}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">Becomes capture instructions in the study. Tell Droid about camera view and task timing.</span>
          </label>

          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Suggested measurements</div>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Included for the writing demo — toggle off if this module measures something else.</p>
            <div className="space-y-2">
              {SUGGESTED.map((m) => {
                const on = measurements.some((x) => x.name === m.name);
                return (
                  <label key={m.name} className={cn("flex gap-2 rounded-md border p-3", on ? "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900/60" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900")}>
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => toggleSuggested(m)} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.label}</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{m.hint}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {m.name} · {m.unit}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">Plan measurements</div>
            <div className="space-y-2">
              {measurements.map((m, i) => (
                <div key={`${m.name}-${i}`} className="flex gap-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      className={input}
                      value={m.label}
                      onChange={(e) => {
                        invalidatePlan();
                        setMeasurements((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)));
                      }}
                    />
                    <div className="flex gap-2">
                      <input
                        className={cn(input, "font-mono text-xs")}
                        value={m.name}
                        onChange={(e) => {
                          invalidatePlan();
                          setMeasurements((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, name: slugify(e.target.value) || x.name } : x)),
                          );
                        }}
                      />
                      <input
                        className={cn(input, "w-28")}
                        value={m.unit}
                        onChange={(e) => {
                          invalidatePlan();
                          setMeasurements((xs) => xs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)));
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      invalidatePlan();
                      setMeasurements((xs) => xs.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className={cn(input, "min-w-[10rem] flex-1")}
                placeholder="New measurement label"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <input className={cn(input, "w-28")} value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="unit" />
              <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              <MessageSquare className="h-4 w-4" /> Design loop
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ask Droid whether the plan is possible. Reply to its advice, revise measurements, re-assess, then accept.</p>
            {thread.length > 0 && (
              <ul className="max-h-40 space-y-2 overflow-auto rounded-md bg-white p-2 text-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-600">
                {thread.map((m, i) => (
                  <li key={`${m.at}-${i}`} className={cn(m.role === "droid" ? "text-sky-900 dark:text-sky-300" : "text-slate-700 dark:text-slate-200")}>
                    <span className="font-semibold">{m.role === "droid" ? "Droid" : "You"}: </span>
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              className="min-h-[64px] w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Reply to Droid / add context (camera angle, what “straight” means, …)"
              value={designNote}
              onChange={(e) => setDesignNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={assessing || !!jobId} onClick={askDroid}>
                {assessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                {assessing ? "Assessing…" : thread.length ? "Re-assess with Droid" : "Ask Droid"}
              </Button>
              {assess?.revised_measurements?.length && assess.verdict !== "feasible" && (
                <Button type="button" size="sm" variant="ghost" onClick={applyRevised}>
                  Apply suggested rewrites
                </Button>
              )}
              {assess && !planAccepted && assess.can_accept && (
                <Button type="button" onClick={() => acceptPlan(false)}>
                  <CheckCircle2 className="h-4 w-4" /> Accept plan
                </Button>
              )}
              {assess && !planAccepted && !assess.can_accept && (
                <Button type="button" variant="secondary" onClick={() => acceptPlan(true)} title="Demo override — generate even if Droid wants revisions">
                  <CheckCircle2 className="h-4 w-4" /> Accept plan anyways
                </Button>
              )}
            </div>
            {assess && (
              <div className="flex flex-wrap items-center gap-2">
                {planAccepted && (
                  <Badge tone="green">{assess.can_accept ? "plan accepted" : "accepted anyway (demo)"}</Badge>
                )}
                <span className="text-xs text-slate-600 dark:text-slate-400">{assess.summary}</span>
              </div>
            )}
          </div>

          <Button className="w-full" disabled={pending || !!jobId || !planAccepted} onClick={startJob}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {pending ? "Starting…" : planAccepted ? "Generate with Droid + Daytona" : "Accept a plan to generate"}
          </Button>
          {jobId && (
            <Button type="button" variant="secondary" className="w-full" onClick={resetForm}>
              Start another module
            </Button>
          )}
          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </CardBody>
      </Card>

      <div className="space-y-6">
        {!progress ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              <Sparkles className="h-8 w-8 text-slate-300" />
              <p>Design loop first: propose measurements → Droid advice → accept plan → then the Daytona grid appears here.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title="Generation pipeline"
                description={progress.mode === "live" ? "Live Droid + Daytona generation" : "Template mode (offline draft + local checks)"}
              />
              <CardBody className="space-y-4">
                <Pipeline progress={progress} />
                {progress.components_reused.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {progress.components_reused.map((c) => (
                      <Badge key={c} tone="slate">
                        <Boxes className="mr-1 inline h-3 w-3" />
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Daytona experiment grid"
                description={`${progress.experiments.length || 20} checks · ${progress.experiments[0]?.metrics?.fixture_source ?? "synthetic"} landmark tracks`}
                actions={
                  <div className="flex gap-2 text-xs">
                    <span className="text-emerald-700 dark:text-emerald-400">{passed} passed</span>
                    <span className="text-rose-600 dark:text-rose-400">{failed} failed</span>
                    <span className="text-sky-700">{running} running</span>
                  </div>
                }
              />
              <CardBody>
                {progress.experiments.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Server className="h-4 w-4" /> Waiting to launch sandboxes…
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {progress.experiments.map((e) => (
                      <ExperimentCell key={e.id} exp={e} />
                    ))}
                  </div>
                )}
                {progress.best_params && (
                  <pre className="mt-4 overflow-auto rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] text-emerald-300">
                    best_params = {JSON.stringify(progress.best_params, null, 2)}
                  </pre>
                )}
              </CardBody>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title="Live log" actions={<Bot className="h-4 w-4 text-slate-400" />} />
                <CardBody>
                  <ul className="max-h-64 space-y-2 overflow-auto font-mono text-[11px]">
                    {progress.logs.map((l, i) => (
                      <li key={`${l.t}-${i}`} className={cn(l.level === "error" && "text-rose-600 dark:text-rose-400", l.level === "warn" && "text-amber-700 dark:text-amber-400", l.level === "info" && "text-slate-600 dark:text-slate-400")}>
                        <span className="text-slate-400">{new Date(l.t).toLocaleTimeString()} </span>
                        {l.msg}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Generated module" description={progress.missing_validation ?? "Source ready for review"} />
                <CardBody className="space-y-3">
                  {progress.source_code ? (
                    <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600">
                      {progress.source_code.slice(0, 2400)}
                      {progress.source_code.length > 2400 ? "\n…" : ""}
                    </pre>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Source appears after the Droid draft step.</p>
                  )}
                  {progress.step === "ready" && (
                    <Button onClick={review} disabled={reviewing}>
                      {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      Approve &amp; activate module
                    </Button>
                  )}
                  {progress.step === "approved" && (
                    <div className="space-y-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Approved <span className="font-mono">{progress.module_id}</span>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Live under{" "}
                        <Link href="/researcher/models" className="font-medium underline">
                          Created Modules
                        </Link>{" "}
                        and selectable when you{" "}
                        <Link href="/researcher/studies/new" className="font-medium underline">
                          create a study
                        </Link>
                        . Measurements: {(progress.measurements ?? []).map((m) => m.label).join(", ") || "—"}.
                      </p>
                      <Button type="button" size="sm" variant="secondary" onClick={resetForm}>
                        Generate another module
                      </Button>
                    </div>
                  )}
                  {progress.step === "failed" && (
                    <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
                      <XCircle className="h-4 w-4" /> Generation failed — check the log.
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
