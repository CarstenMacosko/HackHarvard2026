"use client";

import { Bot, Boxes, CheckCircle2, FlaskConical, Loader2, Play, Server, Sparkles, XCircle } from "lucide-react";
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
  { id: "approved", label: "Reviewed" },
];

const DEMO_PRESET = {
  condition: "Focal hand dystonia",
  description: "With a fixed side-view camera, hold a pen for two seconds, then write the same short phrase. Measure index-finger straightening during writing from hand landmarks.",
  measurements: [
    { name: "index_straight_fraction", label: "Index finger straight during writing", unit: "fraction" },
  ],
  media_type: "video" as const,
};

function stepIndex(step: GenerationStep): number {
  if (step === "failed") return -1;
  return STEPS.findIndex((s) => s.id === step);
}

function ExperimentCell({ exp }: { exp: DaytonaExperiment }) {
  const tone =
    exp.status === "passed" ? "bg-emerald-500" : exp.status === "failed" ? "bg-rose-400" : exp.status === "running" ? "bg-sky-500 animate-pulse" : "bg-slate-200";
  return (
    <div
      className={cn("group relative aspect-square rounded-md ring-1 ring-inset ring-slate-200/80", tone)}
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
              done && "bg-emerald-50 text-emerald-800 ring-emerald-200",
              active && "bg-sky-50 text-sky-900 ring-sky-300",
              !done && !active && "bg-white text-slate-400 ring-slate-200",
              failed && i <= Math.max(idx, 0) && "bg-rose-50 text-rose-700 ring-rose-200",
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
  const [condition, setCondition] = useState(DEMO_PRESET.condition);
  const [description, setDescription] = useState(DEMO_PRESET.description);
  const [measurementLabel, setMeasurementLabel] = useState(DEMO_PRESET.measurements[0].label);
  const [measurementUnit, setMeasurementUnit] = useState(DEMO_PRESET.measurements[0].unit);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ daytona: boolean; droid: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [reviewing, startReview] = useTransition();
  const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

  const poll = useCallback(async (id: string) => {
    const res = await fetch(`/api/droid/generate/${id}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Could not load job");
    setProgress(body.job.progress ?? null);
    setMeta({ daytona: body.daytona, droid: body.droid });
    return body.job as { status: string; progress: GenerationProgress | null };
  }, []);

  useEffect(() => {
    fetch("/api/droid/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => setMeta({ daytona: Boolean(s.daytona), droid: Boolean(s.droid) }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const job = await poll(jobId);
        if (cancelled) return;
        if (job.status === "running" || job.status === "requested" || job.progress?.step === "daytona_experiments" || job.progress?.step === "drafting") {
          /* keep polling */
        }
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

  function startJob() {
    setError(null);
    setProgress(null);
    start(async () => {
      const res = await fetch("/api/droid/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          condition,
          description,
          measurements: [{ name: "index_straight_fraction", label: measurementLabel, unit: measurementUnit }],
          media_type: "video",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not start generation");
        return;
      }
      setJobId(body.job_id);
      setMeta({ daytona: body.daytona, droid: body.droid });
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
        setError(body.error ?? "Review failed");
        return;
      }
      await poll(jobId);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(300px,380px)_1fr]">
      <Card className="h-fit">
        <CardHeader title="New writing assessment" description="Describe the task and measurement. Daytona executes the shared index-angle feature on landmark tracks; the generated source stays a candidate." />
        <CardBody className="space-y-4">
          <label className="block text-sm font-medium text-slate-900">
            Condition
            <input className={cn(input, "mt-1")} value={condition} onChange={(e) => setCondition(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-900">
            Assessment description
            <textarea className="mt-1 min-h-[140px] w-full rounded-md border border-slate-300 p-3 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-900">Measurement label
            <input className={cn(input, "mt-1")} value={measurementLabel} onChange={(e) => setMeasurementLabel(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-900">Measurement unit
            <input className={cn(input, "mt-1")} value={measurementUnit} onChange={(e) => setMeasurementUnit(e.target.value)} />
          </label>
          <p className="text-xs text-slate-600">Feature: <code>index_straight_fraction</code>. No videos or clinical labels are supplied. The default checks use clearly labeled synthetic landmark tracks.</p>
          <Button className="w-full" disabled={pending} onClick={startJob}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {pending ? "Starting…" : "Generate with Droid + Daytona"}
          </Button>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {meta && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone={meta.droid ? "green" : "slate"}>{meta.droid ? "Droid live" : "Droid template"}</Badge>
              <Badge tone={meta.daytona ? "blue" : "slate"}>{meta.daytona ? "Daytona cloud" : "Daytona local sandbox"}</Badge>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        {!progress ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-16 text-center text-sm text-slate-500">
              <Sparkles className="h-8 w-8 text-slate-300" />
              <p>Start a writing assessment to inspect a candidate and run 20 landmark-track checks.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title="Generation pipeline"
                description={progress.mode === "live" ? "Live Droid + Daytona generation" : "Template mode (offline draft + local checks)"}
                actions={progress.module_id ? <Badge>{progress.module_id}</Badge> : undefined}
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
                description={`${progress.experiments.length || 20} checks · ${progress.experiments[0]?.metrics?.fixture_source ?? "synthetic"} landmark tracks · up to ${progress.daytona_parallel || 4} workers`}
                actions={
                  <div className="flex gap-2 text-xs">
                    <span className="text-emerald-700">{passed} passed</span>
                    <span className="text-rose-600">{failed} failed</span>
                    <span className="text-sky-700">{running} running</span>
                  </div>
                }
              />
              <CardBody>
                {progress.experiments.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
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
                      <li key={`${l.t}-${i}`} className={cn(l.level === "error" && "text-rose-600", l.level === "warn" && "text-amber-700", l.level === "info" && "text-slate-600")}>
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
                    <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[10px] leading-relaxed text-slate-700 ring-1 ring-slate-200">{progress.source_code.slice(0, 2400)}{progress.source_code.length > 2400 ? "\n…" : ""}</pre>
                  ) : (
                    <p className="text-sm text-slate-500">Source appears after the Droid draft step.</p>
                  )}
                  {progress.step === "ready" && (
                    <Button onClick={review} disabled={reviewing}>
                      {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      Mark candidate reviewed
                    </Button>
                  )}
                  {progress.step === "approved" && (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" /> Reviewed candidate <span className="font-mono">{progress.module_id}</span>; no trained model or deployment.
                    </div>
                  )}
                  {progress.step === "failed" && (
                    <div className="flex items-center gap-2 text-sm text-rose-600">
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
