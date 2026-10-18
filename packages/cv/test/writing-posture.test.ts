import { describe, expect, it } from "vitest";
import { evaluateWritingTrack } from "../src/writing-posture";

/** Synthetic MediaPipe-like frame: index MCP/PIP/DIP nearly colinear (straight). */
function straightIndexFrame(): number[][] {
  const pts = Array.from({ length: 21 }, () => [0, 0]);
  pts[5] = [0, 0];
  pts[6] = [1, 0];
  pts[7] = [2, 0];
  return pts;
}

/** Bent index: PIP angle well below 160°. */
function bentIndexFrame(): number[][] {
  const pts = Array.from({ length: 21 }, () => [0, 0]);
  pts[5] = [0, 0];
  pts[6] = [1, 0];
  pts[7] = [1, 1];
  return pts;
}

describe("evaluateWritingTrack", () => {
  it("accepts a hold-then-write clip with visible index landmarks", () => {
    const fps = 30;
    const hold = Array.from({ length: 60 }, () => straightIndexFrame()); // 2s
    const write = Array.from({ length: 120 }, () => straightIndexFrame()); // 4s
    const result = evaluateWritingTrack([...hold, ...write], fps);
    expect(result.accepted).toBe(true);
    expect(result.straight_fraction).toBe(1);
    expect(result.writing_angle_deg).toBeGreaterThan(170);
  });

  it("reports lower straight fraction when writing is bent", () => {
    const fps = 30;
    const hold = Array.from({ length: 60 }, () => straightIndexFrame());
    const write = Array.from({ length: 120 }, () => bentIndexFrame());
    const result = evaluateWritingTrack([...hold, ...write], fps);
    expect(result.accepted).toBe(true);
    expect(result.straight_fraction).toBe(0);
  });

  it("rejects clips that are too short", () => {
    const frames = Array.from({ length: 30 }, () => straightIndexFrame());
    const result = evaluateWritingTrack(frames, 30);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("incomplete_hold_or_writing");
  });
});
