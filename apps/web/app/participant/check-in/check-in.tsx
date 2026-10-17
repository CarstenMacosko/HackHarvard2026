"use client";

import type { ModuleResult } from "@vf/cv";
import type { QualityCheck, RewardEvent, TaskConfig } from "@vf/shared";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dropzone } from "@/components/dropzone";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, ProgressBar, SectionLabel, cn } from "@/components/ui";
import { analyzePhotoFile, analyzeVideoFile, type VideoModuleId } from "@/lib/cv-client/analyze";
import { planVideoUpload, type UploadPlan } from "@/lib/cv-client/upload";
import { CHECK_LABEL } from "@/lib/format";
import { isMediaKind } from "@/lib/media-kind";

const GUIDE: Record<string, string[]> = {
  photo: [
    "Stand near a window or under a bright light. Turn the flash off.",
    "Hold the phone about a forearm's length (30 cm) away, straight on.",
    "Fit the whole patch in the frame, with some normal skin around it.",
    "Tap the screen to focus before taking the photo.",
  ],
  video: [
    "Prop the phone up so your whole hand and wrist are in view.",
    "Use normal video mode (not slow-motion or time-lapse) in good light.",
    "Tap your index finger and thumb together as fast and as wide as you can.",
    "Keep tapping for at least 10 seconds.",
  ],
  hand_tremor: [
    "Prop the phone up so it stays completely still. A hand-held phone adds its own shake.",
    "Rest your forearm on a table or your lap with your hand relaxed and in view, wrist included.",
    "Use normal video mode (not slow-motion or time-lapse) in good light.",
    "Keep your hand still and relaxed for at least 10 seconds.",
  ],
};

interface Outcome {
  accepted: boolean;
  message: string;
  attempt: number;
  escalated: boolean;
  reward_events: RewardEvent[];
  points_balance: number;
  runtime: "server" | "on-device";
}

type Phase = "capture" | "analyzing" | "rejected" | "ready" | "submitting" | "done";

export function CheckIn({ task, dueNow, serverAnalysis }: { task: TaskConfig; dueNow: boolean; serverAnalysis: boolean }) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState({ fraction: 0, stage: "" });
  const [result, setResult] = useState<ModuleResult | null>(null);
  const [upload, setUpload] = useState<{ photo?: Blob; poster?: Blob }>({});
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setUpload({});
    setError(null);
    setOutcome(null);
    setPhase("capture");
  }

  async function post(intent: "submit" | "failed_attempt", r: ModuleResult, f: File, up: { photo?: Blob; poster?: Blob }): Promise<Outcome> {
    const form = new FormData();
    form.set("task_id", task.id);
    form.set("intent", intent);
    form.set("analysis", JSON.stringify(r));
    form.set("report", JSON.stringify(intent === "submit" ? answers : {}));
    form.set("device", navigator.userAgent.slice(0, 80));
    let plan: UploadPlan;
    if (task.media_type === "photo") plan = { file: up.photo!, filename: "capture.jpg", kind: "original" };
    else plan = await planVideoUpload(f, up.poster!);
    if (plan.mediaPath) form.set("media_path", plan.mediaPath);
    else form.set("file", plan.file!, plan.filename);
    form.set("media_kind", plan.kind);
    const res = await fetch("/api/submissions", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body as Outcome;
  }

  async function onFile(f: File) {
    reset();
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase("analyzing");
    try {
      let r: ModuleResult;
      let up: { photo?: Blob; poster?: Blob };
      if (task.media_type === "photo") {
        if (!isMediaKind(f, "image")) throw new Error("Please choose a photo.");
        setProgress({ fraction: 0.5, stage: "Checking your photo…" });
        const a = await analyzePhotoFile(f, task.quality_criteria);
        r = a.result;
        up = { photo: a.upload };
      } else {
        if (!isMediaKind(f, "video")) throw new Error("Please choose a video.");
        const a = await analyzeVideoFile(f, task.module as VideoModuleId, task.quality_criteria, (fraction, stage) => setProgress({ fraction, stage }));
        r = a.result;
        up = { poster: a.poster };
      }
      setResult(r);
      setUpload(up);
      if (r.quality.accepted) {
        setPhase("ready");
      } else {
        setPhase("rejected");
        // record the unusable attempt so the study team sees it (and can help after three)
        post("failed_attempt", r, f, up)
          .then((o) => {
            setAttempts(o.attempt);
            setOutcome(o);
          })
          .catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading that file.");
      setPhase("capture");
    }
  }

  async function submit() {
    if (!result || !file) return;
    const missing = task.report_questions.find((q) => answers[q.key] === undefined || answers[q.key] === "");
    if (missing) return setError(`Please answer: ${missing.prompt}`);
    setError(null);
    setPhase("submitting");
    try {
      const o = await post("submit", result, file, upload);
      setOutcome(o);
      setAttempts(o.attempt);
      setPhase(o.accepted ? "done" : "rejected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("ready");
    }
  }

  const failed: QualityCheck[] = result ? result.quality.checks.filter((c) => !c.passed && !c.advisory) : [];
  const notes: QualityCheck[] = result ? result.quality.checks.filter((c) => !c.passed && c.advisory) : [];
  // after a submit, the server's verdict (re-analysis) wins over the on-device one
  const rejectionMessages = outcome && !outcome.accepted && outcome.runtime === "server" ? [outcome.message] : failed.map((c) => c.message);
  const accept = task.media_type === "photo" ? "image/*" : "video/*";

  if (phase === "done" && outcome) {
    const pts = outcome.reward_events.reduce((s, e) => s + e.points, 0);
    return (
      <Card className="mx-auto max-w-2xl">
        <CardBody className="flex flex-col items-center py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" strokeWidth={1.5} />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Thank you, that&apos;s a usable check-in</h2>
          <p className="mt-1 max-w-md text-sm text-slate-600">It has been sent to your study team for review.</p>
          {pts > 0 ? (
            <div className="mt-5 rounded-lg bg-brand-50 px-5 py-3 text-sm text-brand-800">
              <div className="flex items-center justify-center gap-1.5 text-base font-semibold">
                <Sparkles className="h-4 w-4" /> +{pts} points
              </div>
              <ul className="mt-1 text-xs text-brand-700">
                {outcome.reward_events.map((e) => (
                  <li key={e.id}>
                    {e.reason}: +{e.points}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-xs">Balance: {outcome.points_balance} pts</div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{outcome.message.replace(/^Usable capture ✅ /, "")}</p>
          )}
          <div className="mt-6 flex gap-2">
            <ButtonLink href="/participant">Back to home</ButtonLink>
            <ButtonLink href="/participant/rewards" variant="secondary">
              See rewards
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,380px)_1fr]">
      <Card className="order-2 h-fit xl:order-1">
        <CardHeader title={`How to record your ${task.media_type}`} />
        <CardBody className="space-y-4">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{task.instructions}</p>
          <ol className="space-y-2 text-sm text-slate-700">
            {(GUIDE[task.module] ?? GUIDE[task.media_type]).map((g, i) => (
              <li key={g} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                {g}
              </li>
            ))}
          </ol>
          <div>
            <SectionLabel>Automatic checks</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(task.quality_criteria)
                .map((k) => k.replace(/_(min|max)$/, ""))
                .filter((k, i, a) => a.indexOf(k) === i)
                .map((k) => (
                  <Badge key={k}>{CHECK_LABEL[k] ?? k}</Badge>
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Your {task.media_type} is checked on this device first, so you know right away if it needs a retake.{serverAnalysis ? " It is then analysed again by the study's server." : ""}
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="order-1 space-y-6 xl:order-2">
        <Card>
          <CardHeader title="1 · Add your capture" actions={file && phase !== "analyzing" ? <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> Start over</Button> : undefined} />
          <CardBody>
            {!file ? (
              <Dropzone
                accept={accept}
                capture="environment"
                onFiles={([f]) => void onFile(f)}
                title={task.media_type === "photo" ? "Take or choose a photo" : "Record or choose a video"}
                hint={`Drag and drop it here, or tap to ${task.media_type === "photo" ? "open the camera" : "record"}.`}
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="overflow-hidden rounded-md bg-slate-900">
                  {task.media_type === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview!} alt="Your photo" className="aspect-[4/3] w-full object-contain" />
                  ) : (
                    <video src={preview!} controls playsInline muted className="aspect-[4/3] w-full object-contain" />
                  )}
                </div>
                <div className="space-y-3">
                  {phase === "analyzing" && (
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {progress.stage || "Checking…"}
                      </div>
                      <ProgressBar value={progress.fraction} />
                    </div>
                  )}
                  {result && (
                    <ul className="space-y-1.5 text-sm">
                      {result.quality.checks.map((c) => (
                        <li key={c.name} className="flex items-center gap-2">
                          {c.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                          <span className={c.passed ? "text-slate-700" : "font-medium text-slate-900"}>{CHECK_LABEL[c.name] ?? c.name}</span>
                          {!c.passed && c.advisory && <span className="text-xs text-amber-700">(accepted)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(phase === "ready" || phase === "submitting") && (
                    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Looks good. Answer the questions below and send it.</div>
                  )}
                  {(phase === "ready" || phase === "submitting") &&
                    notes.map((c) => (
                      <div key={c.name} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {c.message}
                      </div>
                    ))}
                </div>
              </div>
            )}
            {phase === "rejected" && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-medium">This one can&apos;t be used yet.</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {rejectionMessages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={reset}>
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </Button>
                  {attempts > 0 && (
                    <span className="text-xs text-amber-800">
                      Attempt {attempts}
                      {outcome?.escalated ? ": your study coordinator has been told and will reach out to help." : ". Retakes never cost you points."}
                    </span>
                  )}
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          </CardBody>
        </Card>

        <Card className={cn(!(phase === "ready" || phase === "submitting") && "opacity-50")}>
          <CardHeader title="2 · A few quick questions" />
          <CardBody className="space-y-5">
            {task.report_questions.map((q) => (
              <fieldset key={q.key} disabled={!(phase === "ready")}>
                <legend className="mb-2 text-sm font-medium text-slate-900">{q.prompt}</legend>
                {q.type === "choice" && (
                  <div className="flex flex-wrap gap-2">
                    {q.options!.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.key]: o })}
                        className={cn(
                          "h-9 rounded-md px-4 text-sm font-medium ring-1 ring-inset",
                          answers[q.key] === o ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "scale" && (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.key]: n })}
                        className={cn(
                          "tabular h-9 w-9 rounded-md text-sm font-medium ring-1 ring-inset",
                          answers[q.key] === n ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "text" && (
                  <input className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm" value={String(answers[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                )}
              </fieldset>
            ))}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <Button size="lg" onClick={submit} disabled={phase !== "ready"}>
                {phase === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
                Send check-in
              </Button>
              {!dueNow && <span className="text-xs text-slate-500">No check-in is due, so this one won&apos;t earn points.</span>}
              <Link href="/participant" className="ml-auto text-sm text-slate-500 hover:text-slate-900">
                Cancel
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
