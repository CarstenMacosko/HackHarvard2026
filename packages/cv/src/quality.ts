import type { Measurement, QualityCheck, QualityReport } from "@vf/shared";
import { laplacianVariance, mean, type GrayImage } from "./image";

/** Patient-facing messages; keep identical to services/cv/app/quality.py. */
export const MESSAGES = {
  blur: "The picture is blurry. Rest your phone against something steady and tap the screen to focus first.",
  dark: "It's too dark. Turn on a light or face a window (no flash).",
  bright: "It's too bright or washed out. Move out of direct sunlight and turn off the flash.",
} as const;

/**
 * Python's round(x, d): rounds the exact decimal value of the double, ties to even.
 * (x * 10 ** d would add its own rounding error and disagree on near-ties.)
 */
export function pyRound(x: number, d: number): number {
  if (!Number.isFinite(x) || Math.abs(x) < 1e-30) return x;
  const exact = Math.abs(x).toFixed(100); // exact decimal expansion of the double
  const dot = exact.indexOf(".");
  const kept = d > 0 ? exact.slice(0, dot + 1 + d) : exact.slice(0, dot);
  const rest = exact.slice(dot + 1 + d);
  const first = rest.charCodeAt(0) - 48;
  const tail = rest.slice(1).replace(/0+$/, "");
  const lastDigit = Number(kept[kept.length - 1]);
  const up = first > 5 || (first === 5 && (tail.length > 0 || lastDigit % 2 === 1));
  let v = Number(kept);
  if (up) v = Number((v + 10 ** -d).toFixed(d));
  return x < 0 ? -v : v;
}

const round = pyRound;

export function blurCheck(gray: GrayImage, minSharpness: number): QualityCheck {
  const sharpness = laplacianVariance(gray);
  return { name: "blur", passed: sharpness >= minSharpness, value: round(sharpness, 1), threshold: minSharpness, message: MESSAGES.blur };
}

export function exposureCheck(gray: GrayImage, lo: number, hi: number): QualityCheck {
  const m = mean(gray.data);
  return {
    name: "exposure",
    passed: lo <= m && m <= hi,
    value: round(m, 1),
    threshold: m < lo ? lo : hi,
    message: m < lo ? MESSAGES.dark : MESSAGES.bright,
  };
}

export function fractionCheck(name: string, fraction: number, minFraction: number, message: string): QualityCheck {
  return { name, passed: fraction >= minFraction, value: round(fraction, 3), threshold: minFraction, message };
}

export function minValueCheck(name: string, value: number, minimum: number, message: string): QualityCheck {
  return { name, passed: value >= minimum, value: round(value, 2), threshold: minimum, message };
}

export function taskFailed(message: string): QualityCheck {
  return { name: "task_completed", passed: false, value: null, threshold: null, message };
}

export function buildReport(checks: QualityCheck[]): QualityReport {
  const failed = checks.filter((c) => !c.passed);
  return {
    accepted: failed.length === 0,
    checks,
    retry_instructions: failed.length ? `${failed.map((c) => c.message).join(" ")} Then send it again 🙏` : null,
  };
}

/** The capture was usable but the task itself wasn't done (e.g. no taps); message goes to the patient. */
export class TaskNotCompleted extends Error {}

export interface ModuleResult {
  quality: QualityReport;
  measurements: Measurement[];
  features: Record<string, number>;
  model_version: string;
}

/** Shared pipeline semantics: quality gate first, measure only if every check passed. */
export function runPipeline(
  checks: QualityCheck[],
  measure: () => { measurements: Measurement[]; features: Record<string, number> },
  modelVersion: string,
): ModuleResult {
  let measured: { measurements: Measurement[]; features: Record<string, number> } = { measurements: [], features: {} };
  if (checks.every((c) => c.passed)) {
    try {
      measured = measure();
    } catch (e) {
      if (!(e instanceof TaskNotCompleted)) throw e;
      checks = [...checks, taskFailed(e.message)];
    }
  }
  const features = Object.fromEntries(Object.entries(measured.features).map(([k, v]) => [k, round(v, 6)]));
  return { quality: buildReport(checks), measurements: measured.measurements, features, model_version: modelVersion };
}

export function measurement(
  spec: { name: string; label: string; unit: string },
  value: number,
  uncertainty: number | null,
): Measurement {
  return {
    name: spec.name,
    label: spec.label,
    unit: spec.unit,
    value: round(value, 4),
    uncertainty: uncertainty === null ? null : round(uncertainty, 4),
    validation_status: "reusable_needs_validation",
  };
}
