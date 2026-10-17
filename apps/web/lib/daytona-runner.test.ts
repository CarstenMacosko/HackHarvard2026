import { describe, expect, it } from "vitest";
import { buildParamGrid, runExperimentsLocal } from "./daytona-runner";

describe("daytona-runner", () => {
  it("builds a 20-experiment grid", () => {
    const grid = buildParamGrid({ band_lo_hz: 3, band_hi_hz: 12, blur_min: 20, duration_s: 8, hand_visible: 0.8 }, 20);
    expect(grid).toHaveLength(20);
    expect(grid[0].params.band_lo_hz).toBeDefined();
  });

  it("runs local experiments in parallel and reports pass/fail", async () => {
    const grid = buildParamGrid({ band_lo_hz: 3, band_hi_hz: 12, blur_min: 20, duration_s: 8, hand_visible: 0.8 }, 6);
    const updates: string[] = [];
    const results = await runExperimentsLocal(grid, async (e) => {
      updates.push(`${e.id}:${e.status}`);
    }, 3);
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.status === "passed" || r.status === "failed")).toBe(true);
    expect(results.some((r) => r.metrics && r.metrics.score > 0)).toBe(true);
    expect(updates.length).toBeGreaterThan(6);
  });
});
