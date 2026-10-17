import { describe, expect, it } from "vitest";
import { SCORE_NAME, severityScore, withSeverityScore } from "./scores";

const m = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name, value }));

describe("severityScore", () => {
  it("scores brisk, wide, regular tapping as normal", () => {
    const s = severityScore("finger_tapping", m({ tap_rate_hz: 3.6, amplitude_norm: 1.0, amplitude_decrement: 5, rhythm_cv: 0.08 }))!;
    expect(s.value).toBe(0);
  });
  it("takes the worst component, and names it", () => {
    // the synthetic 2.5 Hz test video: rate is slight (1), everything else normal
    const s = severityScore("finger_tapping", m({ tap_rate_hz: 2.5, amplitude_norm: 1.02, amplitude_decrement: 0.4, rhythm_cv: 0.14 }))!;
    expect(s.value).toBe(1);
    expect(s.worst.name).toBe("tap_rate_hz");
    const slow = severityScore("finger_tapping", m({ tap_rate_hz: 1.2, amplitude_norm: 0.5, amplitude_decrement: 45, rhythm_cv: 0.2 }))!;
    expect(slow.value).toBe(4);
    expect(slow.components.map((c) => c.grade)).toEqual([4, 2, 3, 1]);
  });
  it("grades rest tremor by amplitude, ignoring movement that isn't tremor", () => {
    expect(severityScore("hand_tremor", m({ tremor_amplitude: 0.01, tremor_freq_hz: 5, tremor_power_ratio: 0.9 }))!.value).toBe(0);
    expect(severityScore("hand_tremor", m({ tremor_amplitude: 0.2, tremor_freq_hz: 5, tremor_power_ratio: 0.9 }))!.value).toBe(2);
    expect(severityScore("hand_tremor", m({ tremor_amplitude: 0.2, tremor_freq_hz: 5, tremor_power_ratio: 0.1 }))!.value).toBe(0);
    expect(severityScore("hand_tremor", m({ tremor_amplitude: 1.5, tremor_freq_hz: 5, tremor_power_ratio: 0.9 }))!.value).toBe(4);
  });
  it("grades skin by redness and area", () => {
    expect(severityScore("eczema_photo", m({ erythema_index: 1, affected_area_pct: 0 }))!.value).toBe(0);
    expect(severityScore("eczema_photo", m({ erythema_index: 7, affected_area_pct: 35 }))!.value).toBe(3);
  });
  it("gives no score rather than a wrong one", () => {
    expect(severityScore("finger_tapping", m({ tap_rate_hz: 3 }))).toBeNull();
    expect(severityScore("finger_tapping", m({ tap_rate_hz: NaN, amplitude_norm: 1, amplitude_decrement: 0, rhythm_cv: 0.1 }))).toBeNull();
    expect(severityScore("gen_custom_module", m({ x: 1 }))).toBeNull();
  });
  it("puts the score first, once", () => {
    const o = { module: "finger_tapping", measurements: [
      { name: "tap_rate_hz", label: "Tap rate", value: 2.2, unit: "Hz", uncertainty: null, validation_status: "reusable_needs_validation" as const },
      { name: "amplitude_norm", label: "Amplitude", value: 0.9, unit: "× hand size", uncertainty: null, validation_status: "reusable_needs_validation" as const },
      { name: "amplitude_decrement", label: "Decrement", value: 5, unit: "%", uncertainty: null, validation_status: "reusable_needs_validation" as const },
      { name: "rhythm_cv", label: "Rhythm", value: 0.1, unit: "CV", uncertainty: null, validation_status: "reusable_needs_validation" as const },
    ] };
    const scored = withSeverityScore(o);
    expect(scored.measurements[0]).toMatchObject({ name: SCORE_NAME, value: 2, unit: "0–4" });
    expect(withSeverityScore(scored).measurements.filter((x) => x.name === SCORE_NAME)).toHaveLength(1);
  });
});
