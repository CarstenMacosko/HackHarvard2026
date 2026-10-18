import type { CheckIn, CvModel, Observation, Protocol, RewardEvent, Submission, WorkflowDraft } from "@vf/shared";

/** Built-in conditions, plus "other" from the New study form; builder-approved studies can name any condition. */
export type Condition = "parkinsons" | "eczema" | "other" | (string & {});
export type ParticipantStatus = "invited" | "active" | "paused" | "withdrawn" | "completed";

export interface Study {
  id: string;
  name: string;
  condition: Condition;
  status: "draft" | "active" | "closed";
  protocol: Protocol;
}

export interface Participant {
  id: string;
  study_id: string;
  display_name: string;
  phone: string | null;
  invite_code: string;
  status: ParticipantStatus;
  enrolled_at: string | null;
  preferred_time: string | null;
  consented_at?: string | null;
  /** null / undefined = all protocol tasks; otherwise only these task ids */
  enabled_task_ids?: string[] | null;
  /** task_id → custom capture instructions for this participant */
  task_instructions?: Record<string, string>;
}

export type PortalUserRole = "researcher" | "participant";

export interface PortalUser {
  id: string;
  email: string;
  password_hash: string;
  role: PortalUserRole;
  display_name: string;
  participant_id: string | null;
  created_at: string;
}

export interface ObservationNote {
  id: string;
  observation_id: string;
  author: string;
  body: string;
  created_at: string;
}

/** One scheduled check-in and what happened to it (packages/shared/src/schedule.ts). */
export interface ScheduledTask extends CheckIn {
  completed_at: string | null;
  prompted_at?: string | null;
}

/** Everything one capture writes, recorded in a single transaction (record_capture in 0004). */
export interface CaptureRecord {
  submission: Submission;
  observation: Observation | null;
  reward_events: RewardEvent[];
  scheduled_task: { id: string; status: "completed" | "escalated"; completed_at?: string } | null;
  next_task: { participant_id: string; task_id: string; due_at: string; window_hours: number } | null;
  audit: Omit<AuditEntry, "id" | "created_at">;
}

export interface CaptureResult {
  observation_inserted: boolean;
  scheduled_task_updated: boolean;
  rewards_inserted: number;
}

/** A clinician decision on an observation; the observation row holds the latest one. */
export interface Review {
  id: string;
  observation_id: string;
  reviewer: string;
  decision: "accepted" | "corrected" | "rejected";
  corrected_measurements: { name: string; value: number }[] | null;
  before_measurements: Observation["measurements"] | null;
  note: string | null;
  created_at: string;
}

export interface DraftRecord {
  id: string;
  condition: string;
  draft: WorkflowDraft;
  source: WorkflowDraft["source"];
  status: "draft" | "approved" | "discarded";
  study_id: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export type DroidJobStatus = "requested" | "dispatched" | "running" | "succeeded" | "failed";

export interface DroidJob {
  id: string; // the request id (branch droid/model-<id>)
  study_id: string | null;
  module: string; // measurement name
  request: Record<string, unknown>;
  status: DroidJobStatus;
  run_id: number | null;
  run_url: string | null;
  pr_url: string | null;
  error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Live Droid+Daytona generation progress (module generator). */
  progress?: import("./generation-types").GenerationProgress | null;
  kind?: "module_generate";
}

export interface Message {
  id: string;
  participant_id: string | null;
  direction: "inbound" | "outbound";
  channel: string;
  body: string | null;
  media_path: string | null;
  scheduled_task_id: string | null;
  submission_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ParticipantSummary extends Participant {
  completion_rate: number; // completed / due so far
  streak: number;
  last_submission_at: string | null;
  pending_reviews: number;
  points: number;
  escalations: number;
}

export interface StudySummary extends Study {
  participants: number;
  active: number;
  completion_rate: number;
  pending_reviews: number;
  first_try_usable_rate: number;
}

export interface Redemption {
  id: string;
  participant_id: string;
  tier: string;
  points: number;
  payout_label: string;
  mock_code: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export type { CvModel, Observation, RewardEvent, Submission };
