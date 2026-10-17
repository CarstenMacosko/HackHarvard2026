import { DEFAULT_REWARDS, ECZEMA_TASK, FINGER_TAPPING_TASK, type RewardConfig, type RewardEvent, type TaskConfig } from "@vf/shared";
import type { ConvState } from "./conversation";

/**
 * Where the agent keeps participants, conversations and the message log. With SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY set it uses Supabase (supabaseStore.ts); otherwise this in-memory
 * store with two demo participants, so the agent also runs standalone.
 * Captures are never written here: they go to the web app's /api/cv-callback (one ingest path).
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
  /** the scheduled check-in the current conversation is about */
  checkInId?: string | null;
  preferredTime?: string | null;
  timezone?: string | null;
  /** authoritative balance from the web app's reward ledger, when known */
  ledger?: { balance: number; tier: string; lifetime: number; nextTier: { name: string; points: number } | null };
}

export interface LoggedMessage {
  participantId: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  mediaPath?: string | null;
  checkInId?: string | null;
  meta?: Record<string, unknown>;
}

/** A check-in that is due, for the scheduler to prompt. */
export interface DueCheckIn {
  participant: ParticipantRecord;
  checkInId: string;
  taskId: string;
  dueAt: string;
}

export interface StoredMedia {
  /** what the CV service fetches (a signed URL in Supabase mode) */
  analyzeUrl: string;
  /** what the observation keeps (the web app's media proxy path in Supabase mode) */
  mediaUrl: string;
}

export interface Store {
  readonly kind: "supabase" | "memory";
  byAddress(address: string): Promise<ParticipantRecord | undefined>;
  save(p: ParticipantRecord): Promise<void>;
  logMessage(m: LoggedMessage): Promise<void>;
  /** Bring every active participant's check-ins up to date and return the ones due now. */
  dueCheckIns(now: Date): Promise<DueCheckIn[]>;
  markPrompted(checkInId: string, at: Date): Promise<void>;
  escalate(p: ParticipantRecord, taskId: string, reason: string): Promise<void>;
  /** Keep an inbound attachment (Supabase Storage in production) and say where the CV service can read it. */
  storeMedia(p: ParticipantRecord, url: string, contentType: string): Promise<StoredMedia>;
}

const PERIOD_MS = { daily: 86_400_000, twice_weekly: 3 * 86_400_000, weekly: 7 * 86_400_000, biweekly: 14 * 86_400_000 } as const;

export class MemoryStore implements Store {
  readonly kind = "memory";
  private participants = new Map<string, ParticipantRecord>();
  readonly messages: LoggedMessage[] = [];

  constructor(seed = true) {
    if (!seed) return;
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
    for (const p of demo) this.participants.set(p.address, p);
  }

  async byAddress(address: string) {
    return this.participants.get(address);
  }
  async save(p: ParticipantRecord) {
    this.participants.set(p.address, p);
  }
  async logMessage(m: LoggedMessage) {
    this.messages.push(m);
    if (this.messages.length > 1000) this.messages.shift();
  }
  /** Without a database there is no schedule: each task is due one period after it was last prompted. */
  async dueCheckIns(now: Date) {
    const due: DueCheckIn[] = [];
    for (const p of this.participants.values()) {
      const t = p.tasks.find((t) => !p.lastPromptedAt[t.id] || now.getTime() - new Date(p.lastPromptedAt[t.id]).getTime() >= PERIOD_MS[t.cadence]);
      if (t) due.push({ participant: p, checkInId: `${p.id}:${t.id}:${now.toISOString()}`, taskId: t.id, dueAt: now.toISOString() });
    }
    return due;
  }
  async markPrompted() {}
  async escalate(p: ParticipantRecord, taskId: string, reason: string) {
    console.warn(`[escalate] ${p.id} ${taskId}: ${reason}`);
  }
  async storeMedia(_p: ParticipantRecord, url: string) {
    return { analyzeUrl: url, mediaUrl: url };
  }
}
