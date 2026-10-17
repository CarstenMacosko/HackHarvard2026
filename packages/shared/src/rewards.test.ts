import { describe, expect, it } from "vitest";
import {
  DEFAULT_REWARDS,
  balance,
  computeStreak,
  lifetimePoints,
  rewardsForAcceptedSubmission,
  tierFor,
} from "./rewards";

const now = new Date("2026-10-17T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("computeStreak", () => {
  it("counts consecutive weekly periods", () => {
    expect(computeStreak([daysAgo(0), daysAgo(7), daysAgo(14)], "weekly", now)).toBe(3);
  });
  it("survives an open current period", () => {
    expect(computeStreak([daysAgo(7), daysAgo(14)], "weekly", now)).toBe(2);
  });
  it("breaks on a missed period", () => {
    expect(computeStreak([daysAgo(0), daysAgo(21)], "weekly", now)).toBe(1);
  });
  it("is zero with no submissions", () => {
    expect(computeStreak([], "daily", now)).toBe(0);
  });
});

describe("rewardsForAcceptedSubmission", () => {
  it("awards base, on-time and first badge", () => {
    const ev = rewardsForAcceptedSubmission(DEFAULT_REWARDS, {
      participantId: "p1", submissionId: "s1", onTime: true, streak: 1, totalAccepted: 1, at: now,
    });
    expect(ev.map((e) => e.kind)).toEqual(["submission_accepted", "on_time_bonus", "badge"]);
    expect(balance(ev)).toBe(50 + 10 + 25);
  });
  it("applies a capped streak multiplier", () => {
    const ev = rewardsForAcceptedSubmission(DEFAULT_REWARDS, {
      participantId: "p1", submissionId: "s9", onTime: false, streak: 30, totalAccepted: 30, at: now,
    });
    expect(ev.find((e) => e.kind === "streak_bonus")?.points).toBe(50);
  });
});

describe("tierFor", () => {
  it("uses lifetime points so redemptions do not demote", () => {
    const events = [
      { id: "a", participant_id: "p", kind: "submission_accepted" as const, points: 400, reason: "", created_at: "" },
      { id: "b", participant_id: "p", kind: "redemption" as const, points: -300, reason: "", created_at: "" },
    ];
    expect(balance(events)).toBe(100);
    expect(tierFor(DEFAULT_REWARDS, lifetimePoints(events)).current.name).toBe("Silver");
  });
});
