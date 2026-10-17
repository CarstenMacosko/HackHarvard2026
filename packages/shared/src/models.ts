import type { CvModel, Measurement, Observation } from "./schemas";

/**
 * Researcher-trained models: ridge-regression heads on a CV module's feature vector.
 * Pure functions, used by the training wizard (in the browser) and by the ingest pipeline
 * (on the server) to add the model's prediction to every new observation.
 */

export interface RidgeFit {
  weights: number[];
  intercept: number;
  means: number[];
  stds: number[];
}

export interface CvMetrics {
  n: number;
  folds: number;
  mae: number;
  rmse: number;
  r: number;
  baseline_mae: number;
  label_min: number;
  label_max: number;
}

export const MIN_TRAINING_EXAMPLES = 10;
export const DEFAULT_LAMBDAS = [0.01, 0.1, 1, 10, 100];

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error("singular system");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Ridge regression on standardised features; the intercept is not penalised. */
export function fitRidge(X: number[][], y: number[], lambda: number): RidgeFit {
  const n = X.length, p = X[0]?.length ?? 0;
  if (n === 0 || p === 0) throw new Error("empty training set");
  const means = Array.from({ length: p }, (_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const stds = means.map((m, j) => {
    const sd = Math.sqrt(X.reduce((s, row) => s + (row[j] - m) ** 2, 0) / n);
    return sd > 1e-12 ? sd : 1; // constant feature: carries no information, weight shrinks to 0
  });
  const Z = X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
  const ym = y.reduce((s, v) => s + v, 0) / n;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => Z.reduce((s, z) => s + z[i] * z[j], 0) + (i === j ? lambda : 0)));
  const b = Array.from({ length: p }, (_, i) => Z.reduce((s, z, k) => s + z[i] * (y[k] - ym), 0));
  return { weights: solve(A, b), intercept: ym, means, stds };
}

export function predictRidge(fit: RidgeFit, x: number[]): number {
  return fit.intercept + fit.weights.reduce((s, w, j) => s + (w * (x[j] - fit.means[j])) / fit.stds[j], 0);
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/** Deterministic shuffled k-fold split. */
export function kfold(n: number, k: number, seed = 42): number[][] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return Array.from({ length: k }, (_, f) => idx.filter((_, i) => i % k === f));
}

/** Out-of-fold predictions and error metrics for one lambda. */
export function crossValidate(X: number[][], y: number[], lambda: number, k: number) {
  const folds = kfold(y.length, k);
  const oof = new Array<number>(y.length);
  const baseline = new Array<number>(y.length);
  for (const test of folds) {
    const inTest = new Set(test);
    const trainIdx = y.map((_, i) => i).filter((i) => !inTest.has(i));
    const fit = fitRidge(trainIdx.map((i) => X[i]), trainIdx.map((i) => y[i]), lambda);
    for (const i of test) {
      oof[i] = predictRidge(fit, X[i]);
      baseline[i] = fit.intercept;
    }
  }
  const err = oof.map((p, i) => p - y[i]);
  const metrics: CvMetrics = {
    n: y.length,
    folds: k,
    mae: err.reduce((s, e) => s + Math.abs(e), 0) / y.length,
    rmse: Math.sqrt(err.reduce((s, e) => s + e * e, 0) / y.length),
    r: pearson(oof, y),
    baseline_mae: baseline.reduce((s, b, i) => s + Math.abs(b - y[i]), 0) / y.length,
    label_min: Math.min(...y),
    label_max: Math.max(...y),
  };
  return { oof, metrics };
}

export interface TrainedHead {
  fit: RidgeFit;
  lambda: number;
  metrics: CvMetrics;
  oof: number[];
  lambdaScores: { lambda: number; mae: number }[];
}

/** Choose lambda by cross-validated MAE, then refit on all examples. */
export function trainRidgeCV(X: number[][], y: number[], lambdas = DEFAULT_LAMBDAS): TrainedHead {
  if (y.length < MIN_TRAINING_EXAMPLES) throw new Error(`need at least ${MIN_TRAINING_EXAMPLES} labelled examples (have ${y.length})`);
  if (X.some((row) => row.some((v) => !Number.isFinite(v))) || y.some((v) => !Number.isFinite(v))) {
    throw new Error("features and labels must be finite numbers");
  }
  const k = Math.min(5, y.length);
  const scored = lambdas.map((lambda) => ({ lambda, ...crossValidate(X, y, lambda, k) }));
  const best = scored.reduce((a, b) => (b.metrics.mae < a.metrics.mae ? b : a));
  return {
    fit: fitRidge(X, y, best.lambda),
    lambda: best.lambda,
    metrics: best.metrics,
    oof: best.oof,
    lambdaScores: scored.map((s) => ({ lambda: s.lambda, mae: s.metrics.mae })),
  };
}

export interface ModelPrediction {
  value: number;
  /** the raw prediction fell outside the label range seen in training and was clamped */
  extrapolated: boolean;
}

/** Prediction from a stored model, or null if the observation lacks any input feature. */
export function applyModel(model: CvModel, features: Record<string, number>): ModelPrediction | null {
  const x = model.features.map((f) => features[f]);
  if (x.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const raw = predictRidge({ weights: model.weights, intercept: model.intercept, means: model.feature_means, stds: model.feature_stds }, x);
  const { label_min: lo, label_max: hi } = model.metrics;
  const value = Math.min(hi, Math.max(lo, raw));
  return { value, extrapolated: value !== raw };
}

/** Measurements contributed by the active models that apply to this observation. */
export function customMeasurements(obs: Pick<Observation, "module" | "study_id" | "features">, models: CvModel[]): Measurement[] {
  const out: Measurement[] = [];
  for (const m of models) {
    if (!m.active || m.module !== obs.module || (m.study_id !== null && m.study_id !== obs.study_id)) continue;
    const p = applyModel(m, obs.features);
    if (p === null) continue;
    out.push({
      name: m.target.name,
      label: p.extrapolated ? `${m.target.label} (outside training range)` : m.target.label,
      unit: m.target.unit,
      value: Math.round(p.value * 1e4) / 1e4,
      uncertainty: Math.round(m.metrics.rmse * 1e4) / 1e4,
      validation_status: m.status,
    });
  }
  return out;
}
