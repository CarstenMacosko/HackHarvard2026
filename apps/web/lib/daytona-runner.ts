import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import type { DaytonaExperiment } from "./generation-types";
import { cvModuleDirectory } from "./cv-module-path";
import { daytonaApiKey, daytonaApiUrl } from "./live-keys";

export { daytonaConfigured } from "./live-keys";
export interface ExperimentSpec { id: number; label: string; params: Record<string, number> }
export interface CandidateModule { moduleId: string; sourceCode: string }
interface TrackCase { id: string; fps: number; frames: (number | null)[][][]; expected_accept?: boolean; expected_straight?: boolean }

/** These are synthetic software fixtures; a JSON landmark manifest may replace them. */
function syntheticCases(): TrackCase[] {
  function frame(straight: boolean): number[][] {
    const p = Array.from({ length: 21 }, () => [0, 0]);
    p[5] = [0, 0]; p[6] = [0, 10]; p[7] = straight ? [0, 20] : [10, 10];
    p[0] = [0, -15]; p[9] = [0, 5];
    return p;
  }
  const make = (id: string, straight: boolean, count: number, missingFrom = count): TrackCase => ({
    id, fps: 30,
    frames: Array.from({ length: count }, (_, i) => {
      const p: (number | null)[][] = frame(straight);
      if (i >= missingFrom) p[6] = [null, null];
      return p;
    }),
    expected_accept: missingFrom >= count && count >= 180,
    expected_straight: straight,
  });
  return [make("synthetic_straight", true, 240), make("synthetic_bent", false, 240),
    make("synthetic_short", true, 90), make("synthetic_obscured", true, 240, 90)];
}

function loadCases(): { cases: TrackCase[]; source: string } {
  const manifest = process.env.CV_EVAL_TRACK_MANIFEST;
  if (!manifest) return { cases: syntheticCases(), source: "synthetic" };
  const parsed: unknown = JSON.parse(readFileSync(path.resolve(manifest), "utf8"));
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("CV_EVAL_TRACK_MANIFEST must contain a nonempty JSON array");
  for (const c of parsed as TrackCase[]) {
    if (!c.id || !Number.isFinite(c.fps) || c.fps <= 0 || !Array.isArray(c.frames) || c.frames.length > 900 ||
        c.frames.some((f) => !Array.isArray(f) || f.length !== 21)) throw new Error("Invalid landmark track in CV_EVAL_TRACK_MANIFEST");
  }
  return { cases: parsed as TrackCase[], source: "provided" };
}

function experimentPython(spec: ExperimentSpec, candidate: CandidateModule): string {
  const core = readFileSync(path.join(cvModuleDirectory(), "writing_posture_core.py"), "utf8");
  const { cases, source } = loadCases();
  const payload = Buffer.from(JSON.stringify({ spec, candidate, cases, source }), "utf8").toString("base64");
  const encodedCore = Buffer.from(core, "utf8").toString("base64");
  return `import ast, base64, json
payload = json.loads(base64.b64decode(${JSON.stringify(payload)}))
core = base64.b64decode(${JSON.stringify(encodedCore)}).decode()
source = payload["candidate"]["sourceCode"]
module_id = payload["candidate"]["moduleId"]
try:
    tree = ast.parse(source)
    compile(tree, "candidate.py", "exec")
    valid = False
    for cls in (n for n in tree.body if isinstance(n, ast.ClassDef)):
        ids = [s.value.value for s in cls.body if isinstance(s, ast.Assign) and
               any(isinstance(t, ast.Name) and t.id == "id" for t in s.targets) and
               isinstance(s.value, ast.Constant) and isinstance(s.value.value, str)]
        methods = {s.name for s in cls.body if isinstance(s, ast.FunctionDef)}
        if (module_id in ids and {"prepare", "quality_checks", "measure"} <= methods and
            any(isinstance(b, ast.Name) and b.id == "CVModule" for b in cls.bases) and
            any(isinstance(d, ast.Name) and d.id == "register" for d in cls.decorator_list)):
            valid = True
    if not valid:
        raise ValueError("candidate must define a registered CVModule with the requested id")
    namespace = {}
    exec(compile(core, "writing_posture_core.py", "exec"), namespace)
    params = payload["spec"]["params"]
    cases = payload["cases"]
    passed = 0
    accepted = 0
    for case in cases:
        track = [[[float("nan") if x is None else x for x in p] for p in frame] for frame in case["frames"]]
        result = namespace["evaluate_track"](track, case["fps"],
            hold_s=params.get("hold_s", 2.0), straight_deg=params.get("straight_deg", 160),
            min_visible=params.get("min_visible", 0.7), min_duration_s=params.get("min_duration_s", 6))
        accepted += int(result["accepted"])
        ok = result["accepted"] == case["expected_accept"] if "expected_accept" in case else True
        if ok and result["accepted"] and "expected_straight" in case:
            ok = (result["straight_fraction"] >= 0.5) == case["expected_straight"]
        passed += int(ok)
    print(json.dumps({"ok": passed == len(cases), "score": passed / len(cases),
                      "passed_cases": passed, "total_cases": len(cases), "accepted_cases": accepted,
                      "fixture_source": payload["source"], "error": None if passed == len(cases) else "track assertions failed"}))
except Exception as exc:
    print(json.dumps({"ok": False, "score": 0, "passed_cases": 0, "total_cases": 0,
                      "accepted_cases": 0, "fixture_source": payload["source"], "error": str(exc)}))`;
}

type Evaluation = { ok: boolean; score: number; passed_cases: number; total_cases: number; accepted_cases: number; fixture_source: string; error: string | null };
function parseOutput(out: string): Evaluation {
  const line = out.trim().split("\n").filter(Boolean).pop();
  if (!line) throw new Error("Evaluator returned no output");
  const result = JSON.parse(line) as Evaluation;
  if (!Number.isFinite(result.score) || !Number.isInteger(result.total_cases)) throw new Error("Invalid evaluator output");
  return result;
}
async function localPython(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    proc.stdout.on("data", (b) => { out += b.toString(); });
    proc.stderr.on("data", (b) => { err += b.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(err || `Python exited ${code}`)));
  });
}
function initial(specs: ExperimentSpec[]): DaytonaExperiment[] {
  return specs.map((s) => ({ ...s, status: "queued", sandbox_id: null, metrics: null, error: null, ms: null }));
}
async function runWithWorkers(specs: ExperimentSpec[], onUpdate: (exp: DaytonaExperiment) => Promise<void>,
  candidate: CandidateModule, workers: { id: string; run: (script: string) => Promise<string> }[]): Promise<DaytonaExperiment[]> {
  const results = initial(specs);
  for (const r of results) await onUpdate(r);
  let next = 0;
  await Promise.all(workers.map(async (worker) => {
    while (next < specs.length) {
      const idx = next++;
      const start = Date.now();
      results[idx] = { ...results[idx], status: "running", sandbox_id: worker.id };
      await onUpdate(results[idx]);
      try {
        const parsed = parseOutput(await worker.run(experimentPython(specs[idx], candidate)));
        results[idx] = { ...results[idx], status: parsed.ok ? "passed" : "failed",
          metrics: { score: parsed.score, passed_cases: parsed.passed_cases, total_cases: parsed.total_cases,
            accepted_cases: parsed.accepted_cases, fixture_source: parsed.fixture_source },
          error: parsed.error, ms: Date.now() - start };
      } catch (e) {
        results[idx] = { ...results[idx], status: "failed", error: e instanceof Error ? e.message : String(e), ms: Date.now() - start };
      }
      await onUpdate(results[idx]);
    }
  }));
  return results;
}
export async function runExperimentsLocal(specs: ExperimentSpec[], onUpdate: (exp: DaytonaExperiment) => Promise<void>,
  candidate: CandidateModule, concurrency = 4): Promise<DaytonaExperiment[]> {
  return runWithWorkers(specs, onUpdate, candidate,
    Array.from({ length: Math.min(concurrency, specs.length) }, (_, i) => ({ id: `local-python-${i}`, run: localPython })));
}
export async function runExperimentsDaytona(specs: ExperimentSpec[], onUpdate: (exp: DaytonaExperiment) => Promise<void>,
  candidate: CandidateModule, concurrency = 4): Promise<DaytonaExperiment[]> {
  const apiKey = daytonaApiKey();
  if (!apiKey) throw new Error("DAYTONA_API_KEY is required");
  const { Daytona } = await import("@daytonaio/sdk");
  const daytona = new Daytona({ apiKey, apiUrl: daytonaApiUrl() });
  type Sandbox = Awaited<ReturnType<typeof daytona.create>>;
  const sandboxes: Sandbox[] = [];
  try {
    const created = await Promise.allSettled(Array.from({ length: Math.min(concurrency, specs.length) }, (_, i) =>
      daytona.create({ language: "python", labels: { job: "vf-writing-eval", worker: String(i) },
        autoStopInterval: 10, ephemeral: true }, { timeout: 180 })));
    for (const r of created) if (r.status === "fulfilled") sandboxes.push(r.value);
    const failure = created.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;
    const workers = sandboxes.map((sandbox) => ({ id: sandbox.id, run: async (script: string) => {
      const result = await sandbox.process.codeRun(script, undefined, 60);
      if ((result.exitCode ?? 0) !== 0) throw new Error(`Daytona exit ${result.exitCode}: ${result.result ?? result.artifacts?.stdout ?? ""}`);
      return result.result ?? result.artifacts?.stdout ?? "";
    } }));
    return await runWithWorkers(specs, onUpdate, candidate, workers);
  } finally {
    await Promise.all(sandboxes.map((s) => s.delete().catch(() => undefined)));
    await daytona[Symbol.asyncDispose]?.();
  }
}
export function buildParamGrid(_base: Record<string, number>, n = 20): ExperimentSpec[] {
  const thresholds = [145, 155, 160, 170, 180];
  const visibility = [0.6, 0.7, 0.8, 0.9];
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `exp-${String(i + 1).padStart(2, "0")}`,
    params: { hold_s: 2, straight_deg: thresholds[i % 5], min_visible: visibility[Math.floor(i / 5) % 4], min_duration_s: 6 } }));
}
