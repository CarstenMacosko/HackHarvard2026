import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
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
 * Demo-mode store when Supabase env is not set.
 * Persisted under `.data/demo-state.json` so `npm run dev` keeps data across restarts.
 * `npm run dev:refresh` writes `.data/VF_DEMO_FRESH`: this process starts empty and does not
 * overwrite the saved file, so the next plain `npm run dev` still has prior data.
 */

function isFreshSession(): boolean {
  if (process.env.VF_DEMO_FRESH === "1" || process.env.VF_DEMO_FRESH === "true") return true;
  try {
    return existsSync(path.join(dataDir(), "VF_DEMO_FRESH"));
  } catch {
    return false;
  }
}

/** Exported so backend() can force an empty demo store during refresh sessions. */
export function demoFreshSession(): boolean {
  return isFreshSession();
}

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

function dataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), ".data"),
    path.resolve(process.cwd(), "../../.data"),
    path.resolve(process.cwd(), "../.data"),
  ];
  for (const dir of candidates) {
    const parent = path.dirname(dir);
    if (existsSync(path.join(parent, "package.json")) || existsSync(path.join(parent, "apps"))) return dir;
  }
  return candidates[0];
}

export function demoStatePath(): string {
  return path.join(dataDir(), "demo-state.json");
}

function loadFromDisk(): DemoState | null {
  try {
    const file = demoStatePath();
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<DemoState>;
    const empty = generate();
    return { ...empty, ...raw };
  } catch {
    return null;
  }
}

const g = globalThis as typeof globalThis & { __vfDemoState?: DemoState; __vfDemoPersistTimer?: ReturnType<typeof setTimeout> };

export function demoState(): DemoState {
  if (!g.__vfDemoState) {
    if (isFreshSession()) {
      g.__vfDemoState = generate();
      if (process.env.NODE_ENV !== "production") {
        console.info("[demo-data] VF_DEMO_FRESH=1 — empty session; not writing .data/demo-state.json");
      }
    } else {
      g.__vfDemoState = loadFromDisk() ?? generate();
    }
  }
  return g.__vfDemoState;
}

/** Debounced write so bursts of mutations don't thrash disk. Skipped in fresh sessions. */
export function persistDemoState(): void {
  if (isFreshSession()) return;
  if (g.__vfDemoPersistTimer) clearTimeout(g.__vfDemoPersistTimer);
  g.__vfDemoPersistTimer = setTimeout(() => {
    try {
      const dir = dataDir();
      mkdirSync(dir, { recursive: true });
      const file = demoStatePath();
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(demoState(), null, 0), "utf8");
      renameSync(tmp, file);
    } catch (e) {
      console.warn("[demo-data] persist failed:", e instanceof Error ? e.message : e);
    }
  }, 50);
}

/** Wipe in-memory + on-disk demo state (used by delete-all / tests). */
export function resetDemoState(): void {
  g.__vfDemoState = generate();
  try {
    const file = demoStatePath();
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
  persistDemoState();
}
