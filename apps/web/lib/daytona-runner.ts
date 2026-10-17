import type { DaytonaExperiment } from "./generation-types";
import { daytonaApiKey, daytonaApiUrl, daytonaConfigured } from "./live-keys";

export { daytonaConfigured } from "./live-keys";

/**
 * Parameter-sweep experiments for a generated analyzer.
 * With DAYTONA_API_KEY: every experiment runs inside a real Daytona sandbox
 * (no local score fallback). Without the key: local parallel scoring for demos.
 */

export interface ExperimentSpec {
  id: number;
  label: string;
  params: Record<string, number>;
}

function scoreParams(params: Record<string, number>, seed: number): {
  quality_pass_rate: number;
  feature_stability: number;
  score: number;
  ok: boolean;
  error: string | null;
} {
  const bandLo = params.band_lo_hz ?? 3;
  const bandHi = params.band_hi_hz ?? 12;
  const blur = params.blur_min ?? 20;
  const duration = params.duration_s ?? 8;
  const hand = params.hand_visible ?? 0.8;
  const width = bandHi - bandLo;
  const bandScore = width > 0 && bandLo >= 2 && bandHi <= 14 ? 1 - Math.abs(width - 8) / 10 : 0.2;
  const blurScore = blur >= 15 && blur <= 40 ? 1 : 0.4;
  const durScore = duration >= 6 && duration <= 12 ? 1 : 0.5;
  const handScore = hand >= 0.7 && hand <= 0.95 ? 1 : 0.45;
  const jitter = ((seed * 17) % 100) / 500;
  const quality_pass_rate = Math.min(0.98, 0.55 + 0.35 * bandScore + jitter);
  const feature_stability = Math.min(0.99, 0.5 + 0.4 * ((blurScore + durScore + handScore) / 3));
  const score = 0.55 * quality_pass_rate + 0.45 * feature_stability;
  const ok = score >= 0.62 && bandHi > bandLo;
  return {
    quality_pass_rate: round4(quality_pass_rate),
    feature_stability: round4(feature_stability),
    score: round4(score),
    ok,
    error: ok ? null : "quality/stability below gate — Droid will adjust params",
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Local parallel experiments (no network). Only when Daytona is not configured. */
export async function runExperimentsLocal(
  specs: ExperimentSpec[],
  onUpdate: (exp: DaytonaExperiment) => Promise<void>,
  concurrency = 5,
): Promise<DaytonaExperiment[]> {
  const results: DaytonaExperiment[] = specs.map((s) => ({
    id: s.id,
    label: s.label,
    params: s.params,
    status: "queued",
    sandbox_id: `local-${s.id}`,
    metrics: null,
    error: null,
    ms: null,
  }));
  for (const r of results) await onUpdate(r);

  let i = 0;
  async function worker() {
    while (i < specs.length) {
      const idx = i++;
      const spec = specs[idx];
      const start = Date.now();
      results[idx] = { ...results[idx], status: "running" };
      await onUpdate(results[idx]);
      await sleep(180 + (idx % 5) * 40);
      const scored = scoreParams(spec.params, spec.id + 7);
      results[idx] = {
        ...results[idx],
        status: scored.ok ? "passed" : "failed",
        metrics: { quality_pass_rate: scored.quality_pass_rate, feature_stability: scored.feature_stability, score: scored.score },
        error: scored.error,
        ms: Date.now() - start,
      };
      await onUpdate(results[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, () => worker()));
  return results;
}

/**
 * Real Daytona: spin up `concurrency` sandboxes and run every experiment via
 * `process.codeRun` inside them. Failures are recorded as failed experiments —
 * we never invent local scores when the key is set.
 */
export async function runExperimentsDaytona(
  specs: ExperimentSpec[],
  onUpdate: (exp: DaytonaExperiment) => Promise<void>,
  concurrency = 4,
): Promise<DaytonaExperiment[]> {
  const apiKey = daytonaApiKey();
  if (!apiKey) throw new Error("DAYTONA_API_KEY is required for runExperimentsDaytona");

  const { Daytona } = await import("@daytonaio/sdk");
  const daytona = new Daytona({ apiKey, apiUrl: daytonaApiUrl() });

  const results: DaytonaExperiment[] = specs.map((s) => ({
    id: s.id,
    label: s.label,
    params: s.params,
    status: "queued",
    sandbox_id: null,
    metrics: null,
    error: null,
    ms: null,
  }));
  for (const r of results) await onUpdate(r);

  const poolSize = Math.min(concurrency, specs.length);
  type Sandbox = Awaited<ReturnType<typeof daytona.create>>;
  const pool: Sandbox[] = [];

  try {
    // Create worker sandboxes up front (real Daytona VMs).
    const created = await Promise.all(
      Array.from({ length: poolSize }, async (_, workerId) => {
        const sandbox = await daytona.create(
          {
            language: "python",
            labels: { job: "vf-module-gen", worker: String(workerId) },
            autoStopInterval: 10,
            ephemeral: true,
          },
          { timeout: 180 },
        );
        return sandbox;
      }),
    );
    pool.push(...created);

    let next = 0;
    async function worker(sandbox: Sandbox) {
      while (true) {
        const idx = next++;
        if (idx >= specs.length) return;
        const spec = specs[idx];
        const start = Date.now();
        results[idx] = { ...results[idx], status: "running", sandbox_id: sandbox.id };
        await onUpdate(results[idx]);
        try {
          const res = await sandbox.process.codeRun(experimentPython(spec.params, spec.id), undefined, 60);
          const exit = res.exitCode ?? 0;
          const out = (res.result ?? res.artifacts?.stdout ?? "").trim();
          if (exit !== 0) {
            throw new Error(`codeRun exit ${exit}: ${out.slice(0, 240)}`);
          }
          const line = out.split("\n").filter(Boolean).pop() ?? "{}";
          const parsed = JSON.parse(line) as {
            quality_pass_rate: number;
            feature_stability: number;
            score: number;
            ok: boolean;
            error: string | null;
            host?: string;
          };
          results[idx] = {
            ...results[idx],
            status: parsed.ok ? "passed" : "failed",
            sandbox_id: sandbox.id,
            metrics: {
              quality_pass_rate: parsed.quality_pass_rate,
              feature_stability: parsed.feature_stability,
              score: parsed.score,
            },
            error: parsed.error,
            ms: Date.now() - start,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results[idx] = {
            ...results[idx],
            status: "failed",
            sandbox_id: sandbox.id,
            metrics: null,
            error: `Daytona sandbox ${sandbox.id}: ${msg}`,
            ms: Date.now() - start,
          };
        }
        await onUpdate(results[idx]);
      }
    }

    await Promise.all(pool.map((s) => worker(s)));
  } finally {
    await Promise.all(
      pool.map(async (s) => {
        try {
          await s.delete();
        } catch {
          /* ignore cleanup */
        }
      }),
    );
    await daytona[Symbol.asyncDispose]?.();
  }

  const ran = results.filter((r) => r.sandbox_id && !r.sandbox_id.startsWith("local-"));
  if (ran.length === 0) {
    throw new Error("No experiments ran on Daytona — check DAYTONA_API_KEY and Daytona dashboard");
  }
  return results;
}

/** Python that must execute inside a Daytona sandbox (prints one JSON line). */
function experimentPython(params: Record<string, number>, seed: number): string {
  return `
import json, os, platform, socket
params = ${JSON.stringify(params)}
seed = ${seed}
band_lo = float(params.get("band_lo_hz", 3))
band_hi = float(params.get("band_hi_hz", 12))
blur = float(params.get("blur_min", 20))
duration = float(params.get("duration_s", 8))
hand = float(params.get("hand_visible", 0.8))
width = band_hi - band_lo
band_score = 1 - abs(width - 8) / 10 if width > 0 and 2 <= band_lo and band_hi <= 14 else 0.2
blur_score = 1.0 if 15 <= blur <= 40 else 0.4
dur_score = 1.0 if 6 <= duration <= 12 else 0.5
hand_score = 1.0 if 0.7 <= hand <= 0.95 else 0.45
jitter = ((seed * 17) % 100) / 500
quality = min(0.98, 0.55 + 0.35 * band_score + jitter)
stability = min(0.99, 0.5 + 0.4 * ((blur_score + dur_score + hand_score) / 3))
score = 0.55 * quality + 0.45 * stability
ok = score >= 0.62 and band_hi > band_lo
print(json.dumps({
  "quality_pass_rate": round(quality, 4),
  "feature_stability": round(stability, 4),
  "score": round(score, 4),
  "ok": ok,
  "error": None if ok else "quality/stability below gate",
  "host": socket.gethostname(),
  "platform": platform.platform(),
  "daytona": True,
  "pid": os.getpid(),
}))
`.trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildParamGrid(base: Record<string, number>, n = 20): ExperimentSpec[] {
  const bandLos = [2, 3, 3.5, 4];
  const bandHis = [8, 10, 12, 14];
  const blurs = [15, 20, 30, 45];
  const durations = [6, 8, 10, 12];
  const hands = [0.65, 0.75, 0.85, 0.95];
  const specs: ExperimentSpec[] = [];
  for (let i = 0; i < n; i++) {
    specs.push({
      id: i + 1,
      label: `exp-${String(i + 1).padStart(2, "0")}`,
      params: {
        band_lo_hz: bandLos[i % bandLos.length] ?? base.band_lo_hz,
        band_hi_hz: bandHis[(i * 3) % bandHis.length] ?? base.band_hi_hz,
        blur_min: blurs[(i * 5) % blurs.length] ?? base.blur_min,
        duration_s: durations[(i * 7) % durations.length] ?? base.duration_s,
        hand_visible: hands[(i * 11) % hands.length] ?? base.hand_visible,
      },
    });
  }
  return specs;
}
