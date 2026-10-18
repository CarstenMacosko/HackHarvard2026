import "server-only";
import { backend } from "./backend";
import { buildParamGrid, runExperimentsDaytona, runExperimentsLocal } from "./daytona-runner";
import { draftModuleWithDroid, pickComponents, templateModuleSource } from "./droid-generate";
import { emptyProgress, type GenerationLog, type GenerationProgress } from "./generation-types";
import { daytonaConfigured, droidConfigured, liveIntegrationStatus } from "./live-keys";
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
    example_count: 0,
    mode,
  });

  try {
    if (input.media_type !== "video" || !input.measurements.some((m) => m.name === "index_straight_fraction")) {
      throw new Error("Track evaluation currently supports the index_straight_fraction video measurement only. Other candidate modules need task-specific fixtures before evaluation.");
    }
    progress = log(
      { ...progress, step: "inspecting" },
      `Live integrations · Droid=${status.droid ? "on" : "off"} · Daytona=${status.daytona ? "on" : "off"} · exec=${status.droid_exec}`,
    );
    await patch(jobId, progress, "running");
    progress = log(progress, "Inspecting existing CV modules (MediaPipe hands, tapping, tremor, skin)…");
    await patch(jobId, progress);

    const components = pickComponents(input.description, input.media_type);
    const moduleId = `gen_${slugify(input.measurements[0]?.name ?? input.condition)}_${jobId.slice(-6)}`;
    progress = log(
      { ...progress, components_reused: components, module_id: moduleId },
      `Reusing components: ${components.join(", ")}`,
    );
    await patch(jobId, progress);

    progress = log(
      { ...progress, step: "drafting" },
      droidConfigured() ? `Calling Factory Droid (live) via ${status.droid_exec}…` : "FACTORY_API_KEY unset — drafting from hand-movement template…",
    );
    await patch(jobId, progress);

    let params: Record<string, number> = { hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 };
    let draft = await draftModuleWithDroid({
      condition: input.condition,
      description: input.description,
      measurements: input.measurements,
      media_type: input.media_type,
      module_id: moduleId,
      params,
      components,
      has_clinical_labels: false,
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
        progress = log(progress, "DAYTONA_API_KEY unset — executing the same landmark-track checks in local Python.", "warn");
      }
      await patch(jobId, progress);

      let updateQueue = Promise.resolve();
      const onExperimentUpdate = (exp: GenerationProgress["experiments"][number]) => {
        updateQueue = updateQueue.then(async () => {
          const list = [...progress.experiments];
          const at = list.findIndex((e) => e.id === exp.id);
          if (at >= 0) list[at] = exp;
          else list.push(exp);
          list.sort((a, b) => a.id - b.id);
          progress = { ...progress, experiments: list, step: "daytona_experiments" };
          await patch(jobId, progress);
        });
        return updateQueue;
      };
      const experiments = daytonaConfigured()
        ? await runExperimentsDaytona(grid, onExperimentUpdate, { moduleId, sourceCode: draft.source_code }, PARALLEL)
        : await runExperimentsLocal(grid, onExperimentUpdate, { moduleId, sourceCode: draft.source_code }, PARALLEL);

      const passed = experiments.filter((e) => e.status === "passed" && e.metrics);
      const best = [...passed].sort((a, b) =>
        b.metrics!.score - a.metrics!.score ||
        Math.abs(a.params.straight_deg - 160) - Math.abs(b.params.straight_deg - 160) ||
        Math.abs(a.params.min_visible - 0.7) - Math.abs(b.params.min_visible - 0.7))[0];
      progress = log(
        { ...progress, experiments },
        `Track checks finished: ${passed.length}/${experiments.length} passed` + (best ? ` · ${best.metrics!.passed_cases}/${best.metrics!.total_cases} ${best.metrics!.fixture_source} cases (${best.label})` : ""),
      );
      await patch(jobId, progress);

      if (!best) {
        progress = log({ ...progress, step: "iterating" }, "The candidate failed the track/contract checks; retrying with the repository's writing-posture template.", "warn");
        await patch(jobId, progress);
        params = { hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 };
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
            has_clinical_labels: false,
          }),
        };
        progress = { ...progress, source_code: draft.source_code };
        await patch(jobId, progress);
        continue;
      }

      params = best.params;
      progress = log({ ...progress, step: "validating", best_params: params }, "Saving a candidate draft; Daytona checked its Python contract and ran the shared writing feature on landmark tracks.");
      await patch(jobId, progress);

      const finalCode = templateModuleSource({
        condition: input.condition,
        description: input.description,
        measurements: input.measurements,
        media_type: input.media_type,
        module_id: moduleId,
        params,
        components,
        has_clinical_labels: false,
      });
      // The shared feature was tested; a Droid-authored wrapper remains only a proposal.
      const source = /class\s+\w+\(CVModule\)/.test(draft.source_code) && draft.mode === "live"
        ? draft.source_code
        : finalCode;

      progress = log(
        {
          ...progress,
          source_code: source,
          best_params: params,
          module_id: moduleId,
          model_id: null,
          missing_validation: best.metrics!.fixture_source === "synthetic"
            ? "Synthetic landmark tests check software behavior only. The candidate source has not been deployed or clinically validated. Obtain consented captures and clinician labels before use as an endpoint."
            : "Provided landmark tracks check software behavior only. The candidate source has not been deployed or clinically validated. Obtain clinician labels and validate across participants before use as an endpoint.",
          step: "ready",
        },
        "Candidate ready for researcher review in this job record; no trained model was created.",
      );
      await patch(jobId, progress, "succeeded");
      const [jobRow] = (await db.droidJobs(50)).filter((j) => j.id === jobId);
      await db.insertAudit({
        actor: jobRow?.created_by ?? "system",
        action: "droid.module_ready",
        entity: "droid_job",
        entity_id: jobId,
        detail: { module_id: moduleId, fixture_pass_rate: best.metrics!.score, fixture_source: best.metrics!.fixture_source, mode: progress.mode },
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

export async function reviewGeneratedCandidate(jobId: string, actor: string): Promise<{ module_id: string; status: "reviewed_candidate" }> {
  const db = backend();
  const job = (await db.droidJobs(50)).find((j) => j.id === jobId);
  if (!job?.progress?.module_id || job.progress.step !== "ready") {
    throw new Error("Job is not ready for approval");
  }
  const { module_id, source_code } = job.progress;
  if (!source_code) throw new Error("No generated source code on job");

  const progress = log({ ...job.progress, step: "approved" }, `Reviewed candidate ${module_id}; no model activation or CV-service deployment`);
  await db.updateDroidJob(jobId, { progress });
  await db.insertAudit({
    actor,
    action: "droid.candidate_reviewed",
    entity: "droid_job",
    entity_id: jobId,
    detail: { module_id, job_id: jobId },
  });
  return { module_id, status: "reviewed_candidate" };
}

export async function startModuleGeneration(input: StartGenerateInput, actor: string): Promise<DroidJob> {
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
    created_by: actor,
    created_at: at,
    updated_at: at,
    kind: "module_generate",
    progress: emptyProgress({
      description: input.description,
      measurements: input.measurements,
      media_type: input.media_type,
      example_count: 0,
      mode,
    }),
  };
  await backend().insertDroidJob(job);
  return job;
}
