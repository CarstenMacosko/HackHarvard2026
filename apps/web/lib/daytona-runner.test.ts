import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildParamGrid, runExperimentsLocal } from "./daytona-runner";
import { templateModuleSource } from "./droid-generate";

describe("daytona-runner", () => {
  it("builds a 20-experiment grid", () => {
    const grid = buildParamGrid({ hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 }, 20);
    expect(grid).toHaveLength(20);
    expect(grid[0].params.straight_deg).toBeDefined();
  });

  it("executes the landmark feature on synthetic tracks", async () => {
    const grid = buildParamGrid({ hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 }, 6);
    const updates: string[] = [];
    const candidate = { moduleId: "gen_writing_test", sourceCode: `@register\nclass Candidate(CVModule):\n    id = "gen_writing_test"\n    def prepare(self, path): pass\n    def quality_checks(self, prepared, criteria): return []\n    def measure(self, prepared, criteria): pass` };
    const results = await runExperimentsLocal(grid, async (e) => {
      updates.push(`${e.id}:${e.status}`);
    }, candidate, 3);
    expect(results).toHaveLength(6);
    expect(results.map((r) => ({ status: r.status, error: r.error }))).toEqual(results.map(() => ({ status: "passed", error: null })));
    expect(results.every((r) => r.metrics?.fixture_source === "synthetic" && r.metrics.passed_cases === 4)).toBe(true);
    expect(updates.length).toBeGreaterThan(6);
  });

  it("accepts the actual writing-posture candidate template", async () => {
    const moduleId = "gen_writing_template";
    const params = { hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 };
    const sourceCode = templateModuleSource({ condition: "Focal hand dystonia", description: "Pen hold and writing task",
      measurements: [{ name: "index_straight_fraction", label: "Index straight", unit: "fraction" }],
      media_type: "video", module_id: moduleId, params, components: ["hand_landmarks"], has_clinical_labels: false });
    const results = await runExperimentsLocal(buildParamGrid(params, 1), async () => {}, { moduleId, sourceCode }, 1);
    expect(results[0].status).toBe("passed");
    expect(results[0].metrics?.passed_cases).toBe(4);
  });
});
