import type { Cadence } from "@vf/shared";
import { allParticipants, type ParticipantRecord } from "./store";

const PERIOD_MS: Record<Cadence, number> = {
  daily: 86_400_000,
  twice_weekly: 3 * 86_400_000,
  weekly: 7 * 86_400_000,
  biweekly: 14 * 86_400_000,
};

/** Every minute, prompt idle participants whose task period has elapsed.
 * TODO(C): respect each participant's preferred time and quiet hours from scheduled_tasks. */
export function startScheduler(prompt: (p: ParticipantRecord, taskId: string) => Promise<void>): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Date.now();
    for (const p of allParticipants()) {
      if (p.conv.kind !== "idle") continue;
      for (const t of p.tasks) {
        const last = p.lastPromptedAt[t.id];
        if (!last || now - new Date(last).getTime() >= PERIOD_MS[t.cadence]) {
          await prompt(p, t.id);
          break;
        }
      }
    }
  }, 60_000);
}
