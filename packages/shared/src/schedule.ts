import { PERIOD_DAYS } from "./rewards";
import type { Cadence, TaskConfig } from "./schemas";

/**
 * Check-in scheduling, shared by the web app (enrolment, each capture, the participant home
 * page) and the messaging agent's scheduler, so both modes and both services agree.
 *
 * Each protocol task has at most one open check-in at a time. When one is completed or
 * escalated, the next is due one cadence period after it; when one runs past its window with
 * nothing usable it is marked missed and the next is scheduled the same way. Periods that
 * passed entirely are skipped, so a returning participant gets one check-in, not a backlog.
 */

export const WINDOW_HOURS = 48;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type CheckInStatus = "pending" | "prompted" | "completed" | "missed" | "escalated";

export interface CheckIn {
  id: string;
  participant_id: string;
  task_id: string;
  due_at: string;
  window_hours: number;
  status: CheckInStatus;
}

export type NewCheckIn = Omit<CheckIn, "id" | "status"> & { id?: string };

export const isOpen = (t: Pick<CheckIn, "status">) => t.status === "pending" || t.status === "prompted";

/** The check-in after one due at `prevDue`: one period later, skipping periods that are already over. */
export function nextDueAt(prevDue: string, cadence: Cadence, now: Date = new Date(), windowHours = WINDOW_HOURS): string {
  const period = PERIOD_DAYS[cadence] * DAY_MS;
  let next = new Date(prevDue).getTime() + period;
  while (next + windowHours * HOUR_MS < now.getTime()) next += period;
  return new Date(next).toISOString();
}

export interface SchedulePlan {
  /** open check-ins whose window has passed */
  missed: string[];
  /** check-ins to create (insert-if-absent: (participant, task, due_at) is unique) */
  create: NewCheckIn[];
}

/** What to change so each protocol task has exactly one current or upcoming check-in. */
export function planSchedule(participantId: string, tasks: TaskConfig[], existing: CheckIn[], now: Date = new Date()): SchedulePlan {
  const plan: SchedulePlan = { missed: [], create: [] };
  for (const task of tasks) {
    const mine = existing.filter((t) => t.participant_id === participantId && t.task_id === task.id);
    const expired = mine.filter((t) => isOpen(t) && new Date(t.due_at).getTime() + t.window_hours * HOUR_MS < now.getTime());
    plan.missed.push(...expired.map((t) => t.id));
    if (mine.some((t) => isOpen(t) && !expired.includes(t))) continue;
    const latest = mine.map((t) => t.due_at).sort().at(-1);
    // a new participant's first check-in is due right away, so their first capture counts
    const due = latest ? nextDueAt(latest, task.cadence, now) : now.toISOString();
    plan.create.push({ participant_id: participantId, task_id: task.id, due_at: due, window_hours: WINDOW_HOURS });
  }
  return plan;
}
