import type { Observation, RewardEvent } from "@vf/shared";
import type {
  AuditEntry,
  CvModel,
  DraftRecord,
  DroidJob,
  Message,
  ObservationNote,
  Participant,
  PortalUser,
  Redemption,
  Review,
  ScheduledTask,
  Study,
  Submission,
} from "./types";

/**
 * In-memory fallback when Supabase env is not set. Starts empty so the UI only reflects
 * studies, participants, captures and reviews created through product actions in this process.
 * Connect Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) for durable shared data.
 */

export interface DemoState {
  studies: Study[];
  participants: Participant[];
  observations: Observation[];
  submissions: Submission[];
  scheduledTasks: ScheduledTask[];
  rewardEvents: RewardEvent[];
  redemptions: Redemption[];
  models: CvModel[];
  audit: AuditEntry[];
  reviews: Review[];
  messages: Message[];
  drafts: DraftRecord[];
  droidJobs: DroidJob[];
  portalUsers: PortalUser[];
  observationNotes: ObservationNote[];
}

/** Empty starting state — also the template for optional seed regeneration. */
export function generate(_NOW = Date.now()): DemoState {
  return {
    studies: [],
    participants: [],
    observations: [],
    submissions: [],
    scheduledTasks: [],
    rewardEvents: [],
    redemptions: [],
    models: [],
    audit: [],
    reviews: [],
    messages: [],
    drafts: [],
    droidJobs: [],
    portalUsers: [],
    observationNotes: [],
  };
}

const g = globalThis as typeof globalThis & { __vfDemoState?: DemoState };

export function demoState(): DemoState {
  return (g.__vfDemoState ??= generate());
}
