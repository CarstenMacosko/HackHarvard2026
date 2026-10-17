import type { Measurement } from "./schemas";

/**
 * Rule-based 0–4 severity score for every usable capture, shown as the headline value on the
 * researcher side. Each component is graded 0–4 against fixed cut-offs; the score is the worst
 * component, the way MDS-UPDRS raters score the worst feature they see. Nothing here is trained
 * on data, and the cut-offs are not yet validated: every score is tagged "needs validation".
 */

export const SCORE_NAME = "severity_score";

export interface ScoreComponent {
  name: string;
  label: string;
  value: number;
  unit: string;
  grade: number;
}

export interface SeverityScore {
  value: number;
  /** the component that set the score */
  worst: ScoreComponent;
  components: ScoreComponent[];
  basis: string;
}

type Grader = { name: string; label: string; unit: string; grade: (v: number, all: Record<string, number>) => number };

/** Grade by ascending cut-offs: below cuts[0] → 0, …, at or above cuts[3] → 4. */
const rising = (cuts: [number, number, number, number]) => (v: number) => cuts.filter((c) => v >= c).length;
/** Grade where larger is healthier: at or above cuts[0] → 0, …, below cuts[3] → 4. */
const falling = (cuts: [number, number, number, number]) => (v: number) => cuts.filter((c) => v < c).length;

const RULES: Record<string, { basis: string; graders: Grader[] }> = {
  finger_tapping: {
    basis: "MDS-UPDRS 3.4-style: slowing, small taps, decrement and irregular rhythm each graded 0–4; the worst sets the score",
    graders: [
      { name: "tap_rate_hz", label: "Tap rate", unit: "Hz", grade: falling([3.0, 2.5, 2.0, 1.5]) },
      { name: "amplitude_norm", label: "Amplitude", unit: "× hand size", grade: falling([0.8, 0.6, 0.4, 0.2]) },
      { name: "amplitude_decrement", label: "Amplitude decrement", unit: "%", grade: rising([10, 25, 40, 60]) },
      { name: "rhythm_cv", label: "Rhythm variability", unit: "CV", grade: rising([0.15, 0.25, 0.35, 0.5]) },
    ],
  },
  hand_tremor: {
    basis: "MDS-UPDRS 3.17-style rest tremor amplitude (0.1 hand sizes ≈ 1 cm); movement that isn't mostly tremor counts as none",
    graders: [
      {
        name: "tremor_amplitude",
        label: "Tremor amplitude",
        unit: "× hand size",
        grade: (v, all) => ((all.tremor_power_ratio ?? 1) < 0.3 || v < 0.02 ? 0 : 1 + [0.1, 0.3, 1.0].filter((c) => v >= c).length),
      },
    ],
  },
  eczema_photo: {
    basis: "EASI-style: redness intensity and affected area each graded 0–4; the worst sets the score",
    graders: [
      { name: "erythema_index", label: "Redness", unit: "Δa*", grade: rising([2, 5, 10, 15]) },
      { name: "affected_area_pct", label: "Affected area", unit: "% of skin", grade: (v) => (v <= 0 ? 0 : 1 + [10, 30, 50].filter((c) => v >= c).length) },
    ],
  },
};

/** The score for one capture, or null when the module has no rules or a measurement is missing. */
export function severityScore(module: string, measurements: Pick<Measurement, "name" | "value">[]): SeverityScore | null {
  const rule = RULES[module];
  if (!rule) return null;
  const values = Object.fromEntries(measurements.map((m) => [m.name, m.value]));
  const components: ScoreComponent[] = [];
  for (const g of rule.graders) {
    const v = values[g.name];
    if (typeof v !== "number" || !Number.isFinite(v)) return null; // no score rather than a wrong one
    components.push({ name: g.name, label: g.label, value: v, unit: g.unit, grade: Math.max(0, Math.min(4, g.grade(v, values))) });
  }
  const worst = components.reduce((a, b) => (b.grade > a.grade ? b : a));
  return { value: worst.grade, worst, components, basis: rule.basis };
}

export function scoreMeasurement(s: SeverityScore): Measurement {
  return { name: SCORE_NAME, label: "Severity score (0–4, rule-based)", value: s.value, unit: "0–4", uncertainty: null, validation_status: "reusable_needs_validation" };
}

/** Measurements with the severity score first (computed if missing, e.g. captures recorded before scoring existed). */
export function withSeverityScore<T extends { module: string; measurements: Measurement[] }>(o: T): T {
  if (o.measurements.some((m) => m.name === SCORE_NAME)) return o;
  const s = severityScore(o.module, o.measurements);
  return s ? { ...o, measurements: [scoreMeasurement(s), ...o.measurements] } : o;
}

export const SCORE_WORDS = ["normal", "slight", "mild", "moderate", "severe"] as const;
