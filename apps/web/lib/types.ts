import type { CvModel, Observation, Protocol, RewardEvent, Submission } from "@vf/shared";

export type Condition = "parkinsons" | "eczema";
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
}

/** One scheduled check-in and what happened to it. */
export interface ScheduledTask {
  id: string;
  participant_id: string;
  task_id: string;
  due_at: string;
  window_hours: number;
  status: "pending" | "completed" | "missed" | "escalated";
  completed_at: string | null;
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
