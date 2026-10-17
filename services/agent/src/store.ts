import { DEFAULT_REWARDS, ECZEMA_TASK, FINGER_TAPPING_TASK, type RewardConfig, type RewardEvent, type TaskConfig } from "@vf/shared";
import type { ConvState } from "./conversation";

/**
 * In-memory participant store so the agent runs standalone.
 * TODO(C/A): back this with Supabase (participants, scheduled_tasks, messages, reward_events).
 */
export interface ParticipantRecord {
  id: string;
  studyId: string;
  address: string;
  name: string;
  tasks: TaskConfig[];
  rewards: RewardConfig;
  conv: ConvState;
  acceptedAt: string[];
  rewardEvents: RewardEvent[];
  lastPromptedAt: Record<string, string>;
}

const participants = new Map<string, ParticipantRecord>();

export function seedDemoParticipants(): void {
  const demo: ParticipantRecord[] = [
    {
      id: "p_001", studyId: "study_pd", address: "+15550000001", name: "Participant 001",
      tasks: [FINGER_TAPPING_TASK], rewards: DEFAULT_REWARDS, conv: { kind: "idle" },
      acceptedAt: [], rewardEvents: [], lastPromptedAt: {},
    },
    {
      id: "p_101", studyId: "study_ad", address: "+15550000002", name: "Participant 101",
      tasks: [ECZEMA_TASK], rewards: DEFAULT_REWARDS, conv: { kind: "idle" },
      acceptedAt: [], rewardEvents: [], lastPromptedAt: {},
    },
  ];
  for (const p of demo) participants.set(p.address, p);
}

export const byAddress = (address: string) => participants.get(address);
export const allParticipants = () => [...participants.values()];
export function save(p: ParticipantRecord): void {
  participants.set(p.address, p);
}
