import "server-only";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  TASK_LIBRARY,
  WRITING_POSTURE_TASK,
  clinicalQuestionsForModule,
  type TaskConfig,
} from "@vf/shared";
import { backend } from "./backend";
import { cvModuleDirectory } from "./cv-module-path";
import type { GenerationProgress } from "./generation-types";

/** Approved Droid candidates that are live for studies and participant captures. */
export interface CreatedModule {
  id: string;
  version: string;
  label: string;
  condition: string;
  description: string;
  media_type: "photo" | "video";
  measurements: { name: string; label: string; unit: string }[];
  default_criteria: Record<string, number>;
  job_id: string;
  approved_at: string;
  source_code: string;
}

const DEFAULT_CRITERIA = {
  blur: 20,
  exposure_min: 60,
  exposure_max: 220,
  hand_visible: 0.8,
  index_visible: 0.7,
  duration_s: 6,
  fps: 20,
  hold_s: 2,
  straight_deg: 160,
};

function progressMeasurements(p: GenerationProgress): CreatedModule["measurements"] {
  const fromJob = p.measurements?.length ? p.measurements : [];
  const hasStraight = fromJob.some((m) => m.name === "index_straight_fraction");
  const hasPip = fromJob.some((m) => m.name === "index_pip_angle_deg");
  const out = [...fromJob];
  if (!hasStraight) {
    out.unshift({ name: "index_straight_fraction", label: "Index finger straight during writing", unit: "fraction" });
  }
  if (!hasPip) {
    out.push({ name: "index_pip_angle_deg", label: "Mean index PIP angle during writing", unit: "degrees" });
  }
  return out;
}

/** Normalize candidate source so the registry loads a deployable module id/version. */
export function normalizeApprovedSource(source: string, moduleId: string): string {
  let next = source.replace(/version\s*=\s*["']0\.1\.0-candidate["']/, 'version = "0.1.0"');
  if (!next.includes(`id = "${moduleId}"`) && !next.includes(`id = '${moduleId}'`)) {
    next = next.replace(/id\s*=\s*["'][^"']+["']/, `id = ${JSON.stringify(moduleId)}`);
  }
  if (!next.includes('MeasurementSpec("index_pip_angle_deg"') && !next.includes("MeasurementSpec('index_pip_angle_deg'")) {
    next = next.replace(
      /measurements\s*=\s*\[[^\]]*\]/s,
      `measurements = [
        MeasurementSpec("index_straight_fraction", "Index finger straight during writing", "fraction"),
        MeasurementSpec("index_pip_angle_deg", "Mean index PIP angle during writing", "degrees"),
    ]`,
    );
  }
  if (!next.includes('self.measurement("index_pip_angle_deg"')) {
    next = next.replace(
      /measurements=\[self\.measurement\("index_straight_fraction", result\["straight_fraction"\], None\)\]/,
      `measurements=[self.measurement("index_straight_fraction", result["straight_fraction"], None),
                          self.measurement("index_pip_angle_deg", result["writing_angle_deg"], None)]`,
    );
  }
  return next;
}

export function writeGeneratedModuleFile(moduleId: string, sourceCode: string): string {
  if (!/^gen_[a-z0-9_]+$/.test(moduleId)) {
    throw new Error(`Refusing to write module id ${moduleId}; expected gen_*`);
  }
  const dir = cvModuleDirectory();
  const filePath = path.join(dir, `${moduleId}.py`);
  writeFileSync(filePath, sourceCode.endsWith("\n") ? sourceCode : `${sourceCode}\n`, "utf8");
  return filePath;
}

function createdFromJob(job: {
  id: string;
  created_at: string;
  updated_at?: string;
  request: { condition?: string; description?: string };
  progress?: GenerationProgress | null;
}): CreatedModule | null {
  const p = job.progress;
  if (!p || p.step !== "approved" || !p.module_id || !p.source_code) return null;
  const measurements = progressMeasurements(p);
  return {
    id: p.module_id,
    version: "0.1.0",
    label:
      (typeof p.name === "string" && p.name.trim()) ||
      (typeof (job.request as { name?: string }).name === "string" && (job.request as { name?: string }).name!.trim()) ||
      measurements[0]?.label ||
      "Generated writing posture",
    condition: String(job.request.condition ?? "focal_hand_dystonia"),
    description: p.description || String(job.request.description ?? ""),
    media_type: p.media_type,
    measurements,
    default_criteria: { ...DEFAULT_CRITERIA, ...(p.best_params ?? {}) },
    job_id: job.id,
    approved_at: job.updated_at ?? job.created_at,
    source_code: p.source_code,
  };
}

/** Approved generated modules (Created Modules). Empty until a researcher approves a candidate. */
export async function listCreatedModules(): Promise<CreatedModule[]> {
  const jobs = await backend().droidJobs(100);
  const byId = new Map<string, CreatedModule>();
  for (const job of jobs) {
    const created = createdFromJob(job);
    if (created) byId.set(created.id, created);
  }
  return [...byId.values()].sort((a, b) => b.approved_at.localeCompare(a.approved_at));
}

export async function getCreatedModule(moduleId: string): Promise<CreatedModule | null> {
  return (await listCreatedModules()).find((m) => m.id === moduleId) ?? null;
}

/** Build a study task config for a foundational library entry or an approved gen_* module. */
export async function taskConfigForModule(moduleId: string, cadence?: TaskConfig["cadence"]): Promise<TaskConfig | null> {
  if (moduleId === "writing_posture") {
    // Hidden from researcher UI; keep resolvable for legacy rows / backend assist only.
    return { ...structuredClone(WRITING_POSTURE_TASK), ...(cadence ? { cadence } : {}) };
  }
  const base = TASK_LIBRARY[moduleId];
  if (base) return { ...structuredClone(base), ...(cadence ? { cadence } : {}) };

  const created = await getCreatedModule(moduleId);
  if (!created) return null;
  return {
    ...structuredClone(WRITING_POSTURE_TASK),
    id: `task_${created.id}`,
    module: created.id,
    label: created.label,
    media_type: created.media_type,
    cadence: cadence ?? WRITING_POSTURE_TASK.cadence,
    instructions: created.description || WRITING_POSTURE_TASK.instructions,
    quality_criteria: created.default_criteria,
    report_questions: clinicalQuestionsForModule("writing_posture"),
    measurements: created.measurements.map((m) => ({
      ...m,
      validation_status: "reusable_needs_validation" as const,
    })),
  };
}
