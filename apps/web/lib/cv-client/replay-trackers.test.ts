/**
 * Tests for the iterable replay tracker registry.
 * Callers: vitest. API under test: resolveReplayTracker / REPLAY_TRACKERS.
 * User: "you should make this iterable so that if i add a new feature type that it
 * automatically has a built in tracker."
 */
import { describe, expect, it } from "vitest";
import { REPLAY_TRACKERS, resolveReplayTracker } from "./replay-trackers";

describe("resolveReplayTracker", () => {
  it("picks PIP only for PIP measurements", () => {
    const t = resolveReplayTracker([{ name: "index_pip_angle_deg", label: "PIP", unit: "degrees" }]);
    expect(t?.id).toBe("pip_angle");
  });

  it("picks knuckle for custom angles, not PIP", () => {
    const t = resolveReplayTracker([{ name: "knuckle_to_palm_angle", label: "Knuckle–palm", unit: "degrees" }]);
    expect(t?.id).toBe("knuckle_angle");
    expect(t?.label).toBe("Knuckle–palm");
  });

  it("picks straightness for straightness-only plans", () => {
    const t = resolveReplayTracker([{ name: "index_straight_fraction", label: "Straight", unit: "fraction" }]);
    expect(t?.id).toBe("straightness");
  });

  it("falls back by module when measurements are empty", () => {
    expect(resolveReplayTracker([], "finger_tapping")?.id).toBe("tip_gap");
    expect(resolveReplayTracker([], "hand_tremor")?.id).toBe("hand_motion");
  });

  it("registry is iterable — every tracker has id, match, sample", () => {
    expect(REPLAY_TRACKERS.length).toBeGreaterThan(0);
    for (const t of REPLAY_TRACKERS) {
      expect(t.id).toBeTruthy();
      expect(typeof t.match).toBe("function");
      expect(typeof t.sample).toBe("function");
    }
  });
});
