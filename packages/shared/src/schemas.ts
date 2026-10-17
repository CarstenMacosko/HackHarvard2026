import { z } from "zod";

/**
 * Shared contracts between the web app, the messaging agent and the CV service.
 * The Python CV service mirrors these in services/cv/app/models.py — change both together.
 */

export const ValidationStatus = z.enum([
  "validated", // validated for this use in this study
  "reusable_needs_validation", // existing component, not yet validated for this condition
  "new_model_required", // needs new labeled data and a new model
]);
export type ValidationStatus = z.infer<typeof ValidationStatus>;

export const QualityCheck = z.object({
  name: z.string(), // e.g. "blur", "exposure", "hand_visible", "duration"
  passed: z.boolean(),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  message: z.string(), // patient-facing fix when it fails
  advisory: z.boolean().optional(), // recorded and shown to clinicians, but never rejects the capture
});
export type QualityCheck = z.infer<typeof QualityCheck>;

export const QualityReport = z.object({
  accepted: z.boolean(),
  checks: z.array(QualityCheck),
  retry_instructions: z.string().nullable(),
});
export type QualityReport = z.infer<typeof QualityReport>;

export const Measurement = z.object({
  name: z.string(), // e.g. "tap_rate_hz"
  label: z.string(), // e.g. "Tap rate"
  value: z.number(),
  unit: z.string(),
  uncertainty: z.number().nullable(), // ± same unit
  validation_status: ValidationStatus,
});
export type Measurement = z.infer<typeof Measurement>;

export const ReviewStatus = z.enum(["pending", "accepted", "corrected", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const ReportValue = z.union([z.string(), z.number(), z.boolean()]);

/** PRD §4 common observation format, shared by every condition module. */
export const Observation = z.object({
  id: z.string(),
  study_id: z.string(),
  participant_id: z.string(),
  submission_id: z.string(),
  module: z.string(), // registry id, e.g. "finger_tapping"
  task_label: z.string(), // task or body region, e.g. "Right hand" or "Left inner elbow"
  captured_at: z.string(), // ISO timestamp
  media_url: z.string().nullable(),
  quality: QualityReport,
  measurements: z.array(Measurement),
  /** numeric feature vector from the CV module; researcher-trained models read it (see models.ts) */
  features: z.record(z.number()).default({}),
  model_version: z.string(),
  patient_report: z.record(ReportValue),
  context: z.record(ReportValue),
  review_status: ReviewStatus,
  reviewer: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  review_note: z.string().nullable(),
});
export type Observation = z.infer<typeof Observation>;

export const ReportQuestion = z.object({
  key: z.string(),
  prompt: z.string(),
  type: z.enum(["scale", "choice", "text"]),
  options: z.array(z.string()).optional(),
});
export type ReportQuestion = z.infer<typeof ReportQuestion>;

export const Cadence = z.enum(["daily", "twice_weekly", "weekly", "biweekly"]);
export type Cadence = z.infer<typeof Cadence>;

/** One task in a protocol: which CV module runs, how the agent asks for it, what counts as usable. */
export const TaskConfig = z.object({
  id: z.string(),
  module: z.string(),
  label: z.string(),
  media_type: z.enum(["photo", "video"]),
  cadence: Cadence,
  instructions: z.string(), // first message the agent sends
  quality_criteria: z.record(z.number()), // thresholds, keyed by quality check name
  report_questions: z.array(ReportQuestion),
  measurements: z.array(
    z.object({ name: z.string(), label: z.string(), unit: z.string(), validation_status: ValidationStatus }),
  ),
});
export type TaskConfig = z.infer<typeof TaskConfig>;

export const RewardTier = z.object({ name: z.string(), points: z.number(), payout_label: z.string() });
export type RewardTier = z.infer<typeof RewardTier>;

export const RewardConfig = z.object({
  base_points: z.number(),
  on_time_bonus: z.number(),
  streak_step: z.number(), // multiplier added per consecutive on-schedule period
  max_multiplier: z.number(),
  tiers: z.array(RewardTier),
});
export type RewardConfig = z.infer<typeof RewardConfig>;

export const ConsentForm = z.object({
  title: z.string(),
  body: z.string(),
});
export type ConsentForm = z.infer<typeof ConsentForm>;

/** Recurring outbound texts (medication, upload reminders) distinct from capture-task cadence. */
export const ReminderConfig = z.object({
  id: z.string(),
  kind: z.enum(["capture", "adherence", "custom"]),
  every_hours: z.number().positive(),
  message: z.string(),
  task_id: z.string().nullable().default(null),
});
export type ReminderConfig = z.infer<typeof ReminderConfig>;

export const Protocol = z.object({
  study_id: z.string(),
  version: z.number(),
  approved_by: z.string().nullable(),
  tasks: z.array(TaskConfig),
  rewards: RewardConfig,
  consent: ConsentForm.optional(),
  reminders: z.array(ReminderConfig).default([]),
});
export type Protocol = z.infer<typeof Protocol>;

export const RewardEventKind = z.enum(["submission_accepted", "on_time_bonus", "streak_bonus", "badge", "redemption"]);
export type RewardEventKind = z.infer<typeof RewardEventKind>;

export const RewardEvent = z.object({
  id: z.string(),
  participant_id: z.string(),
  kind: RewardEventKind,
  points: z.number(), // negative for redemptions
  reason: z.string(),
  created_at: z.string(),
});
export type RewardEvent = z.infer<typeof RewardEvent>;

/** Draft produced by the workflow builder for a new condition; a clinician approves before activation. */
export const WorkflowDraft = z.object({
  condition: z.string(),
  summary: z.string(),
  tasks: z.array(TaskConfig),
  validation_plan: z.array(z.string()),
  source: z.enum(["claude", "template"]),
});
export type WorkflowDraft = z.infer<typeof WorkflowDraft>;

/** Where a measurement was computed: the participant's browser or the CV service. */
export const AnalysisRuntime = z.enum(["on-device", "server"]);
export type AnalysisRuntime = z.infer<typeof AnalysisRuntime>;

/** One capture attempt, usable or not. Accepted attempts link to the observation they produced. */
export const Submission = z.object({
  id: z.string(),
  participant_id: z.string(),
  study_id: z.string(),
  task_id: z.string(),
  scheduled_task_id: z.string().nullable(),
  attempt: z.number().int().min(1),
  source: z.enum(["web", "sms"]),
  media_type: z.enum(["photo", "video"]),
  media_url: z.string().nullable(),
  analysis_runtime: AnalysisRuntime,
  quality: QualityReport,
  accepted: z.boolean(),
  observation_id: z.string().nullable(),
  escalated: z.boolean(),
  created_at: z.string(),
});
export type Submission = z.infer<typeof Submission>;

export const LabelKind = z.enum(["expert", "self_report", "synthetic", "researcher"]);
export type LabelKind = z.infer<typeof LabelKind>;

export const ModelProvenance = z.object({
  source: z.enum(["training_kit", "droid"]),
  dataset: z.string(),
  dataset_title: z.string(),
  licence: z.string(),
  url: z.string(),
  citation: z.string(),
  label_kind: LabelKind,
  n_cases: z.number().int(),
  n_excluded_quality: z.number().int(),
  auc: z.number().nullable(),
  worst_subgroup: z.object({ name: z.string(), metric: z.string(), value: z.number(), n: z.number().int() }).nullable(),
  card_path: z.string(),
  spec_path: z.string(),
  kit_version: z.string(),
});
export type ModelProvenance = z.infer<typeof ModelProvenance>;

/**
 * A researcher-trained model: a ridge-regression head on top of a CV module's feature vector,
 * predicting a study-specific target (e.g. a clinician's 0–4 erythema grade).
 */
export const CvModel = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  study_id: z.string().nullable(), // null = available to every study using the module
  module: z.string(), // base CV module whose features it reads
  target: z.object({ name: z.string(), label: z.string(), unit: z.string() }),
  kind: z.literal("ridge"),
  features: z.array(z.string()),
  weights: z.array(z.number()),
  intercept: z.number(),
  feature_means: z.array(z.number()),
  feature_stds: z.array(z.number()),
  lambda: z.number(),
  metrics: z.object({
    n: z.number().int(),
    folds: z.number().int(),
    mae: z.number(),
    rmse: z.number(),
    r: z.number(),
    baseline_mae: z.number(), // predicting the training mean
    label_min: z.number(), // predictions are clamped to the range the model was trained on
    label_max: z.number(),
  }),
  status: ValidationStatus,
  active: z.boolean(),
  version: z.number().int(),
  created_by: z.string(),
  created_at: z.string(),
  /** where a model trained outside the browser came from (training kit or Droid); see training/ */
  provenance: ModelProvenance.nullable().optional(),
  /** Droid+Daytona generated analyzer source (Python CVModule); null for ridge heads. */
  source_code: z.string().nullable().optional(),
  /** Tuned quality/measurement params from Daytona experiments. */
  module_params: z.record(z.number()).nullable().optional(),
});
export type CvModel = z.infer<typeof CvModel>;
