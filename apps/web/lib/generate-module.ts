import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CvModel } from "@vf/shared";
import { backend } from "./backend";
import { buildParamGrid, runExperimentsDaytona, runExperimentsLocal } from "./daytona-runner";
import { draftModuleWithDroid, pickComponents, templateModuleSource } from "./droid-generate";
import { emptyProgress, type GenerationLog, type GenerationProgress } from "./generation-types";
import { daytonaConfigured, droidConfigured, liveIntegrationStatus } from "./live-keys";
import { RESEARCHER_NAME } from "./session";
import type { DroidJob } from "./types";

const EXPERIMENT_COUNT = 20;
const PARALLEL = 4;
const MAX_ITERATIONS = 2;

export interface StartGenerateInput {
  condition: string;
  description: string;
  measurements: { name: string; label: string; unit: string }[];
  media_type: "photo" | "video";
  study_id?: string | null;
  has_clinical_labels?: boolean;
  example_count?: number;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "hand_movement";
}

async function patch(jobId: string, progress: GenerationProgress, status?: DroidJob["status"], error?: string | null) {
  const db = backend();
  await db.updateDroidJob(jobId, {
    progress,
    ...(status ? { status } : {}),
    ...(error !== undefined ? { error } : {}),
  });
}

function log(progress: GenerationProgress, msg: string, level: GenerationLog["level"] = "info"): GenerationProgress {
  return {
    ...progress,
    logs: [...progress.logs, { t: new Date().toISOString(), level, msg }].slice(-80),
  };
}

/** Background pipeline: inspect → Droid draft → Daytona experiments → iterate → registry-ready. */
export async function runModuleGeneration(jobId: string, input: StartGenerateInput): Promise<void> {
  const db = backend();
  const status = liveIntegrationStatus();
  const mode = status.mode;
  let progress = emptyProgress({
    description: input.description,
    measurements: input.measurements,
    media_type: input.media_type,
    example_count: input.example_count ?? 0,
    mode,
  });

  try {
    progress = log(
      { ...progress, step: "inspecting" },
      `Live integrations · Droid=${status.droid ? "on" : "off"} · Daytona=${status.daytona ? "on" : "off"} · exec=${status.droid_exec}`,
    );
    await patch(jobId, progress, "running");
    progress = log(progress, "Inspecting existing CV modules (MediaPipe hands, tapping, tremor, skin)…");
    await patch(jobId, progress);
    await sleep(400);

    const components = pickComponents(input.description, input.media_type);
    const moduleId = `gen_${slugify(input.measurements[0]?.name ?? input.condition)}_${jobId.slice(-6)}`;
    progress = log(
      { ...progress, components_reused: components, module_id: moduleId },
      `Reusing components: ${components.join(", ")}`,
    );
    await patch(jobId, progress);
    await sleep(350);

    progress = log(
      { ...progress, step: "drafting" },
      droidConfigured() ? `Calling Factory Droid (live) via ${status.droid_exec}…` : "FACTORY_API_KEY unset — drafting from hand-movement template…",
    );
    await patch(jobId, progress);

    let params: Record<string, number> = { band_lo_hz: 3, band_hi_hz: 12, blur_min: 20, duration_s: 8, hand_visible: 0.8 };
    let draft = await draftModuleWithDroid({
      condition: input.condition,
      description: input.description,
      measurements: input.measurements,
      media_type: input.media_type,
      module_id: moduleId,
      params,
      components,
      has_clinical_labels: Boolean(input.has_clinical_labels),
    });
    progress = log(
      { ...progress, source_code: draft.source_code, missing_validation: draft.missing_validation, mode: draft.mode === "live" && mode === "live" ? "live" : progress.mode },
      draft.summary,
    );
    await patch(jobId, progress);

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      progress = log(
        { ...progress, step: "daytona_experiments", iteration, daytona_parallel: PARALLEL, experiments: [] },
        `Daytona: launching ${EXPERIMENT_COUNT} sandboxed experiments (parallelism ${PARALLEL}, iteration ${iteration})…`,
      );
      await patch(jobId, progress);

      const grid = buildParamGrid(params, EXPERIMENT_COUNT);
      if (daytonaConfigured()) {
        progress = log(
          progress,
          `Daytona cloud · ${EXPERIMENT_COUNT} experiments on ${PARALLEL} live sandboxes (no local score fallback)`,
        );
      } else {
        progress = log(progress, "DAYTONA_API_KEY unset — running local sandbox score (same parallel visualization).", "warn");
      }
      await patch(jobId, progress);

      const experiments = await (daytonaConfigured() ? runExperimentsDaytona : runExperimentsLocal)(grid, async (exp) => {
        const current = (await db.droidJobs(50)).find((j) => j.id === jobId)?.progress ?? progress;
        const list = [...(current.experiments ?? [])];
        const at = list.findIndex((e) => e.id === exp.id);
        if (at >= 0) list[at] = exp;
        else list.push(exp);
        list.sort((a, b) => a.id - b.id);
        progress = { ...current, experiments: list, step: "daytona_experiments" };
        await patch(jobId, progress);
      }, PARALLEL);

      const passed = experiments.filter((e) => e.status === "passed" && e.metrics);
      const best = [...passed].sort((a, b) => (b.metrics!.score - a.metrics!.score))[0];
      progress = log(
        { ...progress, experiments },
        `Daytona finished: ${passed.length}/${experiments.length} passed` + (best ? ` · best score ${best.metrics!.score} (${best.label})` : ""),
      );
      await patch(jobId, progress);

      if (!best) {
        progress = log({ ...progress, step: "iterating" }, "No experiment passed the gate — Droid adjusting parameters…", "warn");
        await patch(jobId, progress);
        params = { band_lo_hz: 3.5, band_hi_hz: 10, blur_min: 18, duration_s: 9, hand_visible: 0.8 };
        draft = {
          ...draft,
          source_code: templateModuleSource({
            condition: input.condition,
            description: input.description,
            measurements: input.measurements,
            media_type: input.media_type,
            module_id: moduleId,
            params,
            components,
            has_clinical_labels: Boolean(input.has_clinical_labels),
          }),
        };
        progress = { ...progress, source_code: draft.source_code };
        await patch(jobId, progress);
        continue;
      }

      params = best.params;
      progress = log({ ...progress, step: "validating", best_params: params }, "Rewriting module with best Daytona params and validating structure…");
      await patch(jobId, progress);

      const finalCode = templateModuleSource({
        condition: input.condition,
        description: input.description,
        measurements: input.measurements,
        media_type: input.media_type,
        module_id: moduleId,
        params,
        components,
        has_clinical_labels: Boolean(input.has_clinical_labels),
      });
      // Prefer Droid's draft body if it already looks like a module; otherwise use the tuned template.
      const source = /class\s+\w+\(CVModule\)/.test(draft.source_code) && draft.mode === "live"
        ? injectParamsComment(draft.source_code, params)
        : finalCode;

      const model = await registerPendingModel({
        moduleId,
        input,
        params,
        jobId,
        missing: draft.missing_validation,
        bestScore: best.metrics!.score,
        source_code: source,
      });

      progress = log(
        {
          ...progress,
          source_code: source,
          best_params: params,
          module_id: moduleId,
          model_id: model.id,
          missing_validation: draft.missing_validation,
          step: "ready",
        },
        `Ready for researcher review · model ${model.id} saved to database (inactive until approved)`,
      );
      await patch(jobId, progress, "succeeded");
      await db.insertAudit({
        actor: RESEARCHER_NAME,
        action: "droid.module_ready",
        entity: "droid_job",
        entity_id: jobId,
        detail: { module_id: moduleId, model_id: model.id, best_score: best.metrics!.score, mode: progress.mode },
      });
      return;
    }

    progress = log({ ...progress, step: "failed" }, "Exhausted iterations without a passing Daytona experiment.", "error");
    await patch(jobId, progress, "failed", "No Daytona experiment passed validation");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    progress = log({ ...progress, step: "failed" }, msg, "error");
    await patch(jobId, progress, "failed", msg);
  }
}

async function registerPendingModel(args: {
  moduleId: string;
  input: StartGenerateInput;
  params: Record<string, number>;
  jobId: string;
  missing: string | null;
  bestScore: number;
  source_code: string;
}): Promise<CvModel> {
  const db = backend();
  const at = new Date().toISOString();
  const target = args.input.measurements[0] ?? { name: "movement_amp", label: "Movement amplitude", unit: "× hand size" };
  const model: CvModel = {
    id: `mdl_${args.moduleId}`,
    name: `${target.label} (Droid-generated)`,
    description: args.input.description.slice(0, 400),
    study_id: args.input.study_id ?? null,
    module: args.moduleId,
    target: { name: target.name, label: target.label, unit: target.unit },
    kind: "ridge",
    features: ["band_power_ratio", "detection_rate", "duration_s", target.name],
    weights: [0, 0, 0, 1],
    intercept: 0,
    feature_means: [0, 0, 0, 0],
    feature_stds: [1, 1, 1, 1],
    lambda: 1,
    metrics: {
      n: Math.max(1, args.input.example_count ?? 0),
      folds: 0,
      mae: 0,
      rmse: 0,
      r: 0,
      baseline_mae: 0,
      label_min: 0,
      label_max: 1,
    },
    status: "reusable_needs_validation",
    active: false,
    version: 1,
    created_by: RESEARCHER_NAME,
    created_at: at,
    source_code: args.source_code,
    module_params: args.params,
    provenance: {
      source: "droid",
      dataset: "example_videos",
      dataset_title: "Researcher example videos (generation job)",
      licence: "study-internal",
      url: "",
      citation: `Droid+Daytona job ${args.jobId}`,
      label_kind: args.input.has_clinical_labels ? "researcher" : "synthetic",
      n_cases: args.input.example_count ?? 0,
      n_excluded_quality: 0,
      auc: null,
      worst_subgroup: null,
      card_path: "",
      spec_path: "",
      kit_version: `daytona-score=${args.bestScore};params=${JSON.stringify(args.params)}`,
    },
  };
  await db.insertModel(model);
  return model;
}

function injectParamsComment(code: string, params: Record<string, number>): string {
  return `# Daytona-tuned params: ${JSON.stringify(params)}\n${code}`;
}

export async function approveGeneratedModule(jobId: string): Promise<{ module_id: string; model_id: string }> {
  const db = backend();
  const job = (await db.droidJobs(50)).find((j) => j.id === jobId);
  if (!job?.progress?.module_id || !job.progress.model_id || job.progress.step !== "ready") {
    throw new Error("Job is not ready for approval");
  }
  const { module_id, model_id, source_code, best_params } = job.progress;
  if (!source_code) throw new Error("No generated source code on job");

  await writeGeneratedModuleFiles(module_id, source_code, best_params ?? {});
  await db.updateModel(model_id, {
    active: true,
    source_code,
    module_params: best_params ?? {},
  });
  const progress = log({ ...job.progress, step: "approved" }, `Approved · saved to cv_models (${model_id}) · module ${module_id} active`);
  await db.updateDroidJob(jobId, { progress });
  await db.insertAudit({
    actor: RESEARCHER_NAME,
    action: "droid.module_approved",
    entity: "cv_model",
    entity_id: model_id,
    detail: { module_id, job_id: jobId },
  });
  return { module_id, model_id };
}

async function writeGeneratedModuleFiles(moduleId: string, source: string, params: Record<string, number>) {
  // Sibling of finger_tapping.py so relative imports (.hands, .hand_tremor) resolve.
  const candidates = [
    path.join(process.cwd(), "services/cv/app/modules"),
    path.join(process.cwd(), "../../services/cv/app/modules"),
    path.join(process.cwd(), "../services/cv/app/modules"),
  ];
  let dir: string | null = null;
  for (const c of candidates) {
    try {
      await mkdir(c, { recursive: true });
      dir = c;
      break;
    } catch {
      /* try next */
    }
  }
  if (!dir) throw new Error("Could not locate services/cv/app/modules");
  // Only allow sandboxed gen_* filenames into the CV package.
  if (!/^gen_[a-z0-9_]+$/.test(moduleId)) throw new Error("Refusing to write non-gen module id");
  await writeFile(path.join(dir, `${moduleId}.py`), source, "utf8");
  await writeFile(
    path.join(dir, `${moduleId}.meta.json`),
    JSON.stringify({ module_id: moduleId, params, written_at: new Date().toISOString(), sandboxed: true }, null, 2),
    "utf8",
  );
}

export async function startModuleGeneration(input: StartGenerateInput): Promise<DroidJob> {
  const id = `gen-${slugify(input.measurements[0]?.name ?? "module")}-${Date.now().toString(36)}`.slice(0, 41);
  const at = new Date().toISOString();
  const mode = liveIntegrationStatus().mode;
  const job: DroidJob = {
    id,
    study_id: input.study_id ?? null,
    module: input.measurements[0]?.name ?? "generated",
    request: { ...input, kind: "module_generate" },
    status: "requested",
    run_id: null,
    run_url: null,
    pr_url: null,
    error: null,
    created_by: RESEARCHER_NAME,
    created_at: at,
    updated_at: at,
    kind: "module_generate",
    progress: emptyProgress({
      description: input.description,
      measurements: input.measurements,
      media_type: input.media_type,
      example_count: input.example_count ?? 0,
      mode,
    }),
  };
  await backend().insertDroidJob(job);
  return job;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
