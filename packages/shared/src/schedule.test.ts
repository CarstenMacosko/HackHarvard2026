import { describe, expect, it } from "vitest";
import { FINGER_TAPPING_TASK, ECZEMA_TASK } from "./catalog";
import { nextDueAt, planSchedule, type CheckIn } from "./schedule";

const now = new Date("2026-10-17T12:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const checkIn = (id: string, due: string, status: CheckIn["status"], task = FINGER_TAPPING_TASK.id): CheckIn => ({ id, participant_id: "p", task_id: task, due_at: due, window_hours: 48, status });

describe("nextDueAt", () => {
  it("is one period after the last check-in", () => {
    expect(nextDueAt(day(-1), "weekly", now)).toBe(day(6));
    expect(nextDueAt(day(-1), "twice_weekly", now)).toBe(day(2));
  });
  it("skips periods that are already over", () => {
    expect(nextDueAt(day(-30), "weekly", now)).toBe(day(-2)); // -23, -16, -9 are past their 48 h window; -2 is still open
  });
});

describe("planSchedule", () => {
  it("schedules a new participant's first check-in now", () => {
    expect(planSchedule("p", [FINGER_TAPPING_TASK], [], now)).toEqual({ missed: [], create: [{ participant_id: "p", task_id: FINGER_TAPPING_TASK.id, due_at: now.toISOString(), window_hours: 48 }] });
  });
  it("leaves an open check-in alone", () => {
    expect(planSchedule("p", [FINGER_TAPPING_TASK], [checkIn("a", day(-1), "pending")], now)).toEqual({ missed: [], create: [] });
    expect(planSchedule("p", [FINGER_TAPPING_TASK], [checkIn("a", day(3), "prompted")], now)).toEqual({ missed: [], create: [] });
  });
  it("marks an expired check-in missed and schedules the next one", () => {
    const plan = planSchedule("p", [FINGER_TAPPING_TASK], [checkIn("a", day(-5), "pending")], now);
    expect(plan.missed).toEqual(["a"]);
    expect(plan.create.map((c) => c.due_at)).toEqual([day(2)]);
  });
  it("after a completed check-in, schedules one period later", () => {
    expect(planSchedule("p", [FINGER_TAPPING_TASK], [checkIn("a", day(-1), "completed")], now).create[0].due_at).toBe(day(6));
  });
  it("handles each protocol task separately", () => {
    const plan = planSchedule("p", [FINGER_TAPPING_TASK, ECZEMA_TASK], [checkIn("a", day(1), "pending")], now);
    expect(plan.create.map((c) => c.task_id)).toEqual([ECZEMA_TASK.id]);
  });
});
