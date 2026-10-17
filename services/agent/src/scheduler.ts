import type { DueCheckIn, Store } from "./store";

/**
 * Every minute: bring check-ins up to date (missed ones closed, next ones created) and prompt
 * participants whose check-in is due, at or after their preferred reminder time. A participant
 * already in a conversation is left alone until it finishes.
 */
export async function tick(store: Store, prompt: (due: DueCheckIn) => Promise<void>, now = new Date()): Promise<number> {
  let prompted = 0;
  const seen = new Set<string>();
  for (const due of await store.dueCheckIns(now)) {
    if (seen.has(due.participant.id) || due.participant.conv.kind !== "idle") continue;
    seen.add(due.participant.id);
    await prompt(due);
    await store.markPrompted(due.checkInId, now);
    prompted++;
  }
  return prompted;
}

export function startScheduler(store: Store, prompt: (due: DueCheckIn) => Promise<void>): NodeJS.Timeout {
  return setInterval(() => void tick(store, prompt).catch((e) => console.error("scheduler:", e)), 60_000);
}
