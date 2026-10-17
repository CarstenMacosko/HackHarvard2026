import { describe, expect, it } from "vitest";
import { tick } from "./scheduler";
import { MemoryStore, type DueCheckIn } from "./store";
import { reminderTimeReached } from "./supabaseStore";

describe("scheduler tick", () => {
  it("prompts each idle participant once, and not again until the next period", async () => {
    const store = new MemoryStore();
    const prompted: DueCheckIn[] = [];
    const prompt = async (d: DueCheckIn) => {
      prompted.push(d);
      d.participant.lastPromptedAt[d.taskId] = new Date("2026-10-17T12:00:00Z").toISOString();
    };
    expect(await tick(store, prompt, new Date("2026-10-17T12:00:00Z"))).toBe(2);
    expect(await tick(store, prompt, new Date("2026-10-18T12:00:00Z"))).toBe(0);
    expect(prompted.map((d) => d.participant.id).sort()).toEqual(["p_001", "p_101"]);
  });

  it("leaves a participant who is mid-conversation alone", async () => {
    const store = new MemoryStore();
    const p = (await store.byAddress("+15550000001"))!;
    p.conv = { kind: "awaiting_media", task: p.tasks[0], attempt: 1, submissionId: "s" };
    const ids: string[] = [];
    await tick(store, async (d) => void ids.push(d.participant.id), new Date());
    expect(ids).toEqual(["p_101"]);
  });
});

describe("reminderTimeReached", () => {
  const tz = "America/New_York"; // UTC-4 in October
  it("waits for the preferred time on the due day", () => {
    expect(reminderTimeReached(new Date("2026-10-17T16:00:00Z"), "2026-10-17T13:00:00Z", "18:00", tz)).toBe(false); // 12:00 local
    expect(reminderTimeReached(new Date("2026-10-17T22:05:00Z"), "2026-10-17T13:00:00Z", "18:00:00", tz)).toBe(true); // 18:05 local
  });
  it("prompts right away for a check-in due on an earlier day, or with no preference", () => {
    expect(reminderTimeReached(new Date("2026-10-18T13:00:00Z"), "2026-10-17T13:00:00Z", "18:00", tz)).toBe(true);
    expect(reminderTimeReached(new Date("2026-10-17T13:00:00Z"), "2026-10-17T13:00:00Z", null, tz)).toBe(true);
  });
});
