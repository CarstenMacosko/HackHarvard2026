import { describe, expect, it } from "vitest";
import { applyModel, customMeasurements, fitRidge, kfold, predictRidge, trainRidgeCV } from "./models";
import type { CvModel } from "./schemas";

function synthetic(n: number, noise = 0, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * 40, b = rand() * 30, c = rand(); // c is irrelevant
    X.push([a, b, c]);
    y.push(0.05 * a + 0.04 * b + 0.3 + noise * (rand() - 0.5));
  }
  return { X, y };
}

describe("ridge", () => {
  it("recovers a noiseless linear relation with tiny lambda", () => {
    const { X, y } = synthetic(40);
    const fit = fitRidge(X, y, 1e-9);
    for (let i = 0; i < 5; i++) expect(predictRidge(fit, X[i])).toBeCloseTo(y[i], 6);
  });

  it("kfold partitions every index exactly once, deterministically", () => {
    const folds = kfold(23, 5);
    expect(folds.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 23 }, (_, i) => i));
    expect(kfold(23, 5)).toEqual(folds);
  });

  it("cross-validated model beats the mean baseline on learnable data", () => {
    const { X, y } = synthetic(60, 0.2);
    const head = trainRidgeCV(X, y);
    expect(head.metrics.n).toBe(60);
    expect(head.metrics.mae).toBeLessThan(head.metrics.baseline_mae / 3);
    expect(head.metrics.r).toBeGreaterThan(0.95);
  });

  it("refuses tiny or non-finite training sets", () => {
    const { X, y } = synthetic(5);
    expect(() => trainRidgeCV(X, y)).toThrow(/at least 10/);
    const big = synthetic(12);
    big.X[0][0] = NaN;
    expect(() => trainRidgeCV(big.X, big.y)).toThrow(/finite/);
  });
});

describe("applying stored models", () => {
  const { X, y } = synthetic(40, 0.1);
  const head = trainRidgeCV(X, y);
  const model: CvModel = {
    id: "m1", name: "grade", description: "", study_id: "study_ad", module: "eczema_photo",
    target: { name: "clinician_grade", label: "Clinician grade (model)", unit: "0–4" },
    kind: "ridge", features: ["a", "b", "c"], weights: head.fit.weights, intercept: head.fit.intercept,
    feature_means: head.fit.means, feature_stds: head.fit.stds, lambda: head.lambda,
    metrics: { ...head.metrics }, status: "reusable_needs_validation", active: true, version: 1,
    created_by: "test", created_at: "2026-10-17T00:00:00Z",
  };

  it("predicts from a feature record and returns null when an input is missing", () => {
    const p = applyModel(model, { a: X[0][0], b: X[0][1], c: X[0][2] })!;
    expect(p.value).toBeCloseTo(Math.min(head.metrics.label_max, Math.max(head.metrics.label_min, predictRidge(head.fit, X[0]))), 9);
    expect(applyModel(model, { a: 1, b: 2 })).toBeNull();
  });

  it("clamps extrapolations to the training label range and flags them", () => {
    const far = applyModel(model, { a: 400, b: 300, c: 0.5 })!;
    expect(far.extrapolated).toBe(true);
    expect(far.value).toBe(head.metrics.label_max);
    const [m] = customMeasurements({ module: "eczema_photo", study_id: "study_ad", features: { a: 400, b: 300, c: 0.5 } }, [model]);
    expect(m.label).toMatch(/outside training range/);
  });

  it("only applies to its module, study and when active", () => {
    const features = { a: 10, b: 10, c: 0.5 };
    expect(customMeasurements({ module: "eczema_photo", study_id: "study_ad", features }, [model])).toHaveLength(1);
    expect(customMeasurements({ module: "finger_tapping", study_id: "study_ad", features }, [model])).toHaveLength(0);
    expect(customMeasurements({ module: "eczema_photo", study_id: "study_pd", features }, [model])).toHaveLength(0);
    expect(customMeasurements({ module: "eczema_photo", study_id: "study_ad", features }, [{ ...model, active: false }])).toHaveLength(0);
    const [m] = customMeasurements({ module: "eczema_photo", study_id: "study_ad", features }, [model]);
    expect(m).toMatchObject({ name: "clinician_grade", validation_status: "reusable_needs_validation" });
  });
});
