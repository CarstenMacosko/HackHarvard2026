import { describe, expect, it } from "vitest";
import { assessPlanDemo } from "./droid-assess";

describe("assessPlanDemo", () => {
  it("accepts the two suggested writing measurements", () => {
    const r = assessPlanDemo({
      condition: "Focal hand dystonia",
      description: "Side-view writing with pen hold then write.",
      measurements: [
        { name: "index_straight_fraction", label: "Index finger straight during writing", unit: "fraction" },
        { name: "index_pip_angle_deg", label: "Mean index PIP angle during writing", unit: "degrees" },
      ],
    });
    expect(r.verdict).toBe("feasible");
    expect(r.can_accept).toBe(true);
  });

  it("rejects force/lab measurements and suggests a rewrite", () => {
    const r = assessPlanDemo({
      condition: "Focal hand dystonia",
      description: "Writing video",
      measurements: [{ name: "grip_force_n", label: "Grip force in newtons", unit: "N" }],
    });
    expect(r.verdict).toBe("impossible");
    expect(r.can_accept).toBe(false);
    expect(r.revised_measurements?.[0]?.name).toBe("index_straight_fraction");
  });

  it("marks vague custom metrics as needing revision", () => {
    const r = assessPlanDemo({
      condition: "Other",
      description: "Record a video of the participant",
      measurements: [{ name: "severity_severity", label: "Severity", unit: "score" }],
    });
    expect(r.verdict).toBe("needs_revision");
    expect(r.can_accept).toBe(false);
  });
});
