/** Live Droid + Daytona module-generation progress (stored on droid_jobs.progress). */

export type GenerationStep =
  | "queued"
  | "inspecting"
  | "drafting"
  | "daytona_experiments"
  | "iterating"
  | "validating"
  | "ready"
  | "approved"
  | "failed";

export interface GenerationLog {
  t: string;
  level: "info" | "warn" | "error";
  msg: string;
}

export interface DaytonaExperiment {
  id: number;
  label: string;
  params: Record<string, number>;
  status: "queued" | "running" | "passed" | "failed";
  sandbox_id: string | null;
  metrics: { passed_cases: number; total_cases: number; accepted_cases: number; fixture_source: string; score: number } | null;
  error: string | null;
  ms: number | null;
}

export interface GenerationProgress {
  step: GenerationStep;
  mode: "live" | "demo";
  description: string;
  measurements: { name: string; label: string; unit: string }[];
  media_type: "photo" | "video";
  example_count: number;
  components_reused: string[];
  logs: GenerationLog[];
  experiments: DaytonaExperiment[];
  best_params: Record<string, number> | null;
  source_code: string | null;
  module_id: string | null;
  /** Honest note when no clinical labels were provided. */
  missing_validation: string | null;
  model_id: string | null;
  daytona_parallel: number;
  iteration: number;
}

export function emptyProgress(input: {
  description: string;
  measurements: { name: string; label: string; unit: string }[];
  media_type: "photo" | "video";
  example_count: number;
  mode: "live" | "demo";
}): GenerationProgress {
  return {
    step: "queued",
    mode: input.mode,
    description: input.description,
    measurements: input.measurements,
    media_type: input.media_type,
    example_count: input.example_count,
    components_reused: [],
    logs: [],
    experiments: [],
    best_params: null,
    source_code: null,
    module_id: null,
    missing_validation: null,
    model_id: null,
    daytona_parallel: 0,
    iteration: 0,
  };
}
