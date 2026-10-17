import "server-only";
import { planSchedule } from "@vf/shared";
import { backend } from "./backend";
import type { Participant, ScheduledTask, Study } from "./types";

/**
 * Bring one participant's check-ins up to date (packages/shared/src/schedule.ts): expired ones
 * become missed and the next ones are created. Runs on enrolment, before each capture and when
 * the participant opens the portal; the messaging agent's scheduler does the same on a timer.
 * Only active participants are scheduled. Returns their check-ins after the change.
 */
export async function ensureSchedule(p: Participant, study?: Study, now: Date = new Date()): Promise<ScheduledTask[]> {
  const db = backend();
  const tasks = await db.scheduledTasks([p.id]);
  if (p.status !== "active") return tasks;
  const s = study ?? (await db.studies()).find((x) => x.id === p.study_id);
  if (!s) return tasks;
  const plan = planSchedule(p.id, s.protocol.tasks, tasks, now);
  if (!plan.missed.length && !plan.create.length) return tasks;
  await db.applySchedule(plan);
  return db.scheduledTasks([p.id]);
}
