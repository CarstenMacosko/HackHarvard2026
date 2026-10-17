import { mean, percentile, std, type GrayImage } from "./image";
import { blurCheck, exposureCheck, fractionCheck, measurement, minValueCheck, runPipeline, TaskNotCompleted, type ModuleResult } from "./quality";

/** Mirror of services/cv/app/modules/finger_tapping.py (FingerTappingModule). */
export const TAPPING_MODULE = {
  id: "finger_tapping",
  version: "0.2.0",
  media_type: "video" as const,
  measurements: [
    { name: "tap_rate_hz", label: "Tap rate", unit: "Hz" },
    { name: "amplitude_norm", label: "Amplitude", unit: "× hand size" },
    { name: "amplitude_decrement", label: "Amplitude decrement", unit: "%" },
    { name: "rhythm_cv", label: "Rhythm variability", unit: "CV" },
  ],
  feature_names: [
    "tap_rate_hz",
    "amplitude_norm",
    "amplitude_decrement",
    "rhythm_cv",
    "n_taps",
    "amplitude_cv",
    "rate_first_half",
    "rate_second_half",
    "detection_rate",
    "duration_s",
  ],
  default_criteria: { blur: 60, exposure_min: 60, exposure_max: 200, hand_visible: 0.8, duration_s: 8, fps: 20 } as Record<string, number>,
};

const MAX_TAP_HZ = 8;
export const THUMB_TIP = 4, INDEX_TIP = 8, WRIST = 0, MIDDLE_MCP = 9;

export interface TapMetrics {
  n_taps: number;
  tap_rate_hz: number;
  tap_rate_unc: number;
  amplitude: number;
  amplitude_unc: number;
  decrement_pct: number;
  rhythm_cv: number;
  amplitude_cv: number;
  rate_first_half: number;
  rate_second_half: number;
}

/** Thumb–index distance over wrist–middle-MCP distance, in pixel space. */
export function handDistance(landmarks: { x: number; y: number }[], width: number, height: number): number {
  const pt = (k: number) => [landmarks[k].x * width, landmarks[k].y * height];
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const scale = dist(pt(WRIST), pt(MIDDLE_MCP));
  return scale > 1e-6 ? dist(pt(THUMB_TIP), pt(INDEX_TIP)) / scale : NaN;
}

/** np.interp over the known (non-NaN) samples; edges take the nearest value. */
export function fillGaps(signal: ArrayLike<number>): number[] {
  const known: number[] = [];
  for (let i = 0; i < signal.length; i++) if (!Number.isNaN(signal[i])) known.push(i);
  if (known.length < 2) throw new TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.");
  const out = new Array<number>(signal.length);
  let k = 0;
  for (let i = 0; i < signal.length; i++) {
    if (i <= known[0]) out[i] = signal[known[0]];
    else if (i >= known[known.length - 1]) out[i] = signal[known[known.length - 1]];
    else {
      while (known[k + 1] < i) k++;
      const a = known[k], b = known[k + 1];
      out[i] = signal[a] + ((signal[b] - signal[a]) * (i - a)) / (b - a);
    }
  }
  return out;
}

/** Least-squares quadratic fit through (xs, ys); returns [c0, c1, c2] for c0 + c1·x + c2·x². */
function quadFit(xs: number[], ys: number[]): [number, number, number] {
  const S = new Array(5).fill(0), T = [0, 0, 0];
  for (let i = 0; i < xs.length; i++) {
    let p = 1;
    for (let k = 0; k < 5; k++) {
      S[k] += p;
      if (k < 3) T[k] += p * ys[i];
      p *= xs[i];
    }
  }
  const M = [
    [S[0], S[1], S[2], T[0]],
    [S[1], S[2], S[3], T[1]],
    [S[2], S[3], S[4], T[2]],
  ];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** scipy.signal.savgol_filter(x, window, 2) with the default mode='interp'. */
export function savgol2(x: number[], window: number): number[] {
  const half = window >> 1;
  const offsets = Array.from({ length: window }, (_, i) => i - half);
  // convolution coefficients: value at 0 of the quadratic least-squares fit, as a linear map of the window
  const coeffs = offsets.map((_, j) => {
    const unit = offsets.map((__, k) => (k === j ? 1 : 0));
    return quadFit(offsets, unit)[0];
  });
  const n = x.length;
  const y = new Array<number>(n);
  for (let i = half; i < n - half; i++) {
    let s = 0;
    for (let j = 0; j < window; j++) s += coeffs[j] * x[i + j - half];
    y[i] = s;
  }
  const idx = Array.from({ length: window }, (_, i) => i);
  const [a0, a1, a2] = quadFit(idx, x.slice(0, window));
  for (let i = 0; i < half; i++) y[i] = a0 + a1 * i + a2 * i * i;
  const [b0, b1, b2] = quadFit(idx, x.slice(n - window));
  for (let i = window - half; i < window; i++) y[n - window + i] = b0 + b1 * i + b2 * i * i;
  return y;
}

/** scipy.signal.find_peaks(x, distance=d, prominence=p): plateau midpoints, distance filter by height, then prominence. */
export function findPeaks(x: number[], distance: number, minProminence: number): number[] {
  const peaks: number[] = [];
  let i = 1;
  const iMax = x.length - 1;
  while (i < iMax) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < iMax && x[ahead] === x[i]) ahead++;
      if (x[ahead] < x[i]) {
        peaks.push((i + ahead - 1) >> 1);
        i = ahead;
      }
    }
    i++;
  }
  const dist = Math.ceil(distance);
  const keep = peaks.map(() => true);
  const order = peaks.map((_, k) => k).sort((a, b) => x[peaks[a]] - x[peaks[b]] || a - b);
  for (let r = order.length - 1; r >= 0; r--) {
    const j = order[r];
    if (!keep[j]) continue;
    for (let k = j - 1; k >= 0 && peaks[j] - peaks[k] < dist; k--) keep[k] = false;
    for (let k = j + 1; k < peaks.length && peaks[k] - peaks[j] < dist; k++) keep[k] = false;
  }
  return peaks
    .filter((_, k) => keep[k])
    .filter((p) => {
      let leftMin = x[p];
      for (let k = p; k >= 0 && x[k] <= x[p]; k--) leftMin = Math.min(leftMin, x[k]);
      let rightMin = x[p];
      for (let k = p; k <= iMax && x[k] <= x[p]; k++) rightMin = Math.min(rightMin, x[k]);
      return x[p] - Math.max(leftMin, rightMin) >= minProminence;
    });
}

export function smoothWindow(fps: number): number {
  return Math.max(5, Math.trunc(fps * 0.1) | 1);
}

export function tapMetrics(distance: ArrayLike<number>, fps: number, detectionRate = 1): TapMetrics {
  let d = fillGaps(distance);
  const win = smoothWindow(fps);
  if (d.length > win) d = savgol2(d, win);
  const spread = percentile(d, 95) - percentile(d, 5);
  if (spread <= 1e-6) throw new TaskNotCompleted("I didn't see any taps. Tap your index finger and thumb together, opening wide each time.");
  const peaks = findPeaks(d, Math.max(1, Math.trunc(fps / MAX_TAP_HZ)), 0.3 * spread);
  if (peaks.length < 4) {
    throw new TaskNotCompleted("I only saw a few taps. Please tap continuously for the full 10 seconds, as fast and wide as you can.");
  }
  const t = peaks.map((p) => p / fps);
  const intervals = t.slice(1).map((v, k) => v - t[k]);
  const rate = 1 / mean(intervals);
  const amps = peaks.map((p, k) => {
    const s = k === 0 ? 0 : peaks[k - 1];
    return d[p] - Math.min(...d.slice(s, p + 1));
  });
  const third = Math.max(1, Math.trunc(amps.length / 3));
  const first = mean(amps.slice(0, third)), last = mean(amps.slice(-third));
  const half = Math.trunc(intervals.length / 2);
  const inflate = 1 / Math.max(detectionRate, 0.25);
  const instRates = intervals.map((v) => 1 / v);
  return {
    n_taps: peaks.length,
    tap_rate_hz: rate,
    tap_rate_unc: instRates.length > 1 ? (std(instRates, 1) / Math.sqrt(instRates.length)) * inflate : 0,
    amplitude: mean(amps),
    amplitude_unc: (std(amps, 1) / Math.sqrt(amps.length)) * inflate,
    decrement_pct: first > 0 ? ((first - last) / first) * 100 : 0,
    rhythm_cv: intervals.length > 1 ? std(intervals, 1) / mean(intervals) : 0,
    amplitude_cv: mean(amps) > 0 ? std(amps) / mean(amps) : 0,
    rate_first_half: half ? 1 / mean(intervals.slice(0, half)) : rate,
    rate_second_half: 1 / mean(intervals.slice(half)),
  };
}

/** What the browser extracts from a video before analysis (mirrors finger_tapping.PreparedVideo). */
export interface PreparedVideo {
  fps: number;
  duration_s: number;
  gray_samples: GrayImage[];
  distance: number[]; // NaN where no hand was detected
  detection_rate: number;
}

/** Indices of the ~10 frames kept for blur/exposure checks (finger_tapping.sample_indices). */
export function sampleIndices(nFrames: number, k = 10): number[] {
  const step = Math.max(1, Math.trunc(nFrames / k));
  const out: number[] = [];
  for (let i = 0; i < nFrames; i += step) out.push(i);
  return out;
}

/** quality.worst_frames: three evenly spaced samples. */
function worstFrames<T>(xs: T[], k = 3): T[] {
  if (xs.length <= k) return xs;
  // np.linspace(0, n - 1, k).astype(int) truncates
  return Array.from({ length: k }, (_, i) => xs[Math.trunc((i * (xs.length - 1)) / (k - 1))]);
}

export function analyzeTapping(p: PreparedVideo, criteria: Record<string, number> = {}): ModuleResult {
  const c = { ...TAPPING_MODULE.default_criteria, ...criteria };
  const sample = worstFrames(p.gray_samples);
  const checks = sample.length
    ? [
        sample.map((g) => blurCheck(g, c.blur)).reduce((a, b) => ((b.value ?? 0) < (a.value ?? 0) ? b : a)),
        exposureCheck(sample[sample.length >> 1], c.exposure_min, c.exposure_max),
      ]
    : [];
  checks.push(
    minValueCheck("duration_s", p.duration_s, c.duration_s, "The video was too short. Please record a full 10 seconds of tapping."),
    minValueCheck("fps", p.fps, c.fps, "The video frame rate is too low. Use your phone's normal video mode (not slow-mo or time-lapse)."),
    fractionCheck(
      "hand_visible",
      p.detection_rate,
      c.hand_visible,
      "I lost sight of your hand. Keep your whole hand, including your wrist, in the frame the entire time.",
    ),
  );
  return runPipeline(
    checks,
    () => {
      const m = tapMetrics(p.distance, p.fps, p.detection_rate);
      const [rate, amp, dec, rhythm] = TAPPING_MODULE.measurements;
      return {
        measurements: [
          measurement(rate, m.tap_rate_hz, m.tap_rate_unc),
          measurement(amp, m.amplitude, m.amplitude_unc),
          measurement(dec, m.decrement_pct, null),
          measurement(rhythm, m.rhythm_cv, null),
        ],
        features: {
          tap_rate_hz: m.tap_rate_hz,
          amplitude_norm: m.amplitude,
          amplitude_decrement: m.decrement_pct,
          rhythm_cv: m.rhythm_cv,
          n_taps: m.n_taps,
          amplitude_cv: m.amplitude_cv,
          rate_first_half: m.rate_first_half,
          rate_second_half: m.rate_second_half,
          detection_rate: p.detection_rate,
          duration_s: p.duration_s,
        },
      };
    },
    `${TAPPING_MODULE.id}@${TAPPING_MODULE.version}`,
  );
}
