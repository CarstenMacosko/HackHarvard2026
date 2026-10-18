import {
  DEFAULT_CONSENT,
  DEFAULT_REMINDERS,
  DEFAULT_REWARDS,
  ECZEMA_TASK,
  FINGER_TAPPING_TASK,
  TREMOR_TASK,
  captureReminderFor,
  type Observation,
  type RewardEvent,
} from "@vf/shared";
import { PRETRAINED_MODELS } from "@vf/shared/pretrained";
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
 * Starting state for running without Supabase, and the source of supabase/seed.sql: the three
 * study definitions, one empty participant account per study (so the participant portal works
 * straight away) and one open invitation per study. There is no generated history: everything
 * researchers see comes from real uploads.
 *
 * Mutations (uploads, reviews, trained models) live in this in-memory store until the server
 * restarts. It sits on globalThis so every route handler and page shares one copy. On a
 * serverless host each instance has its own copy, so connect Supabase for anything shared.
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


const STUDIES: Study[] = [
  {
    id: "study_pd",
    name: "PD-FOLLOW: post-trial motor follow-up",
    condition: "parkinsons",
    status: "active",
    protocol: {
      study_id: "study_pd",
      version: 1,
      approved_by: "Dr. A. Rivera",
      tasks: [FINGER_TAPPING_TASK],
      rewards: DEFAULT_REWARDS,
      consent: { ...DEFAULT_CONSENT, title: "PD-FOLLOW remote motor check-ins" },
      reminders: [DEFAULT_REMINDERS[0], captureReminderFor(FINGER_TAPPING_TASK, 168)],
    },
  },
  {
    id: "study_ad",
    name: "AD-SKIN: atopic dermatitis extension follow-up",
    condition: "eczema",
    status: "active",
    protocol: {
      study_id: "study_ad",
      version: 1,
      approved_by: "Dr. M. Chen",
      tasks: [ECZEMA_TASK],
      rewards: DEFAULT_REWARDS,
      consent: { ...DEFAULT_CONSENT, title: "AD-SKIN remote photo check-ins" },
      reminders: [captureReminderFor(ECZEMA_TASK, 72)],
    },
  },
  {
    id: "study_tremor",
    name: "PD-TREMOR: rest tremor home monitoring",
    condition: "parkinsons",
    status: "active",
    protocol: {
      study_id: "study_tremor",
      version: 1,
      approved_by: "Dr. A. Rivera",
      tasks: [TREMOR_TASK],
      rewards: DEFAULT_REWARDS,
      consent: { ...DEFAULT_CONSENT, title: "PD-TREMOR remote tremor check-ins" },
      reminders: [DEFAULT_REMINDERS[0], captureReminderFor(TREMOR_TASK, 168)],
    },
  },
];

const INVITE_PREFIX: Record<string, string> = { study_pd: "PD", study_ad: "AD", study_tremor: "TR" };

/** One participant account per study for trying the portal, plus one unused invitation. */
const ACCOUNTS: { id: string; study: string; status: Participant["status"] }[] = [
  { id: "p_001", study: "study_pd", status: "active" },
  { id: "p_006", study: "study_pd", status: "invited" },
  { id: "p_101", study: "study_ad", status: "active" },
  { id: "p_106", study: "study_ad", status: "invited" },
  { id: "p_201", study: "study_tremor", status: "active" },
  { id: "p_204", study: "study_tremor", status: "invited" },
];

/** Bundled models the app applies: models trained on synthetic data are left out (training/ still has them). */
export const BUILTIN_MODELS: CvModel[] = PRETRAINED_MODELS.filter((m) => m.provenance?.label_kind !== "synthetic");

/** Also writes supabase/seed.sql (scripts/make-seed.ts), so both modes start from the same state. */
export function generate(NOW = Date.now()): DemoState {
  const state: DemoState = {
    studies: structuredClone(STUDIES),
    participants: [],
    observations: [],
    submissions: [],
    scheduledTasks: [],
    rewardEvents: [],
    redemptions: [],
    models: structuredClone(BUILTIN_MODELS),
    audit: [],
    reviews: [],
    messages: [],
    drafts: [],
    droidJobs: [],
    portalUsers: [],
    observationNotes: [],
  };
  for (const a of ACCOUNTS) {
    const active = a.status === "active";
    state.participants.push({
      id: a.id,
      study_id: a.study,
      display_name: `Participant ${a.id.slice(2)}`,
      phone: null,
      invite_code: `${INVITE_PREFIX[a.study]}-${a.id.slice(2)}${active ? "X" : "J"}`,
      status: a.status,
      enrolled_at: active ? new Date(NOW).toISOString() : null,
      preferred_time: null,
    });
    // an open check-in due now, so the first usable capture counts
    const task = state.studies.find((s) => s.id === a.study)!.protocol.tasks[0];
    if (active) {
      state.scheduledTasks.push({ id: `st_${a.id}_0`, participant_id: a.id, task_id: task.id, due_at: new Date(NOW).toISOString(), window_hours: 48, status: "pending", completed_at: null });
    }
  }
  return state;
}

const g = globalThis as typeof globalThis & { __vfDemoState?: DemoState };

export function demoState(): DemoState {
  return (g.__vfDemoState ??= generate());
}
