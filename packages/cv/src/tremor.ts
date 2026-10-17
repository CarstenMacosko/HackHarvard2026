import { fractionCheck, handVideoChecks, measurement, minValueCheck, pyRound, runPipeline, TaskNotCompleted, type ModuleResult } from "./quality";
import { fillGaps, INDEX_TIP, MIDDLE_MCP, WRIST, type PreparedHandTrack } from "./tapping";

/** Mirror of services/cv/app/modules/hand_tremor.py (HandTremorModule). */
export const TREMOR_MODULE = {
  id: "hand_tremor",
  version: "0.2.0",
  media_type: "video" as const,
  measurements: [
    { name: "tremor_amplitude", label: "Tremor amplitude", unit: "× hand size" },
    { name: "tremor_freq_hz", label: "Tremor frequency", unit: "Hz" },
    { name: "tremor_power_ratio", label: "Tremor share of movement", unit: "fraction" },
  ],
  feature_names: [
    "tremor_freq_hz",
    "tremor_amplitude",
    "tremor_power_ratio",
    "tremor_peak_prominence",
    "finger_tremor_amplitude",
    "low_freq_motion",
    "detection_rate",
    "duration_s",
  ],
  default_criteria: { blur: 20, exposure_min: 60, exposure_max: 220, hand_visible: 0.8, duration_s: 8, fps: 24 } as Record<string, number>,
};

const BAND_LO = 3, BAND_HI = 12, MOTION_MIN_HZ = 0.5, LOW_MOTION_HZ = 2, SEGMENT_S = 4;

export interface TremorMetrics {
  freq_hz: number;
  freq_unc: number;
  amplitude: number;
  power_ratio: number;
  peak_prominence: number;
  finger_amplitude: number;
  low_freq_motion: number;
}

/** np.median */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** scipy.signal.detrend(x, type="linear"): subtract the least-squares line. */
function detrendLinear(x: number[]): number[] {
  const n = x.length;
  let st = 0, sx = 0, stt = 0, stx = 0;
  for (let i = 0; i < n; i++) {
    st += i;
    sx += x[i];
    stt += i * i;
    stx += i * x[i];
  }
  const den = n * stt - st * st;
  const slope = den !== 0 ? (n * stx - st * sx) / den : 0;
  const icept = (sx - slope * st) / n;
  return x.map((v, i) => v - (icept + slope * i));
}

/**
 * scipy.signal.welch(x, fs, window="hann", nperseg, noverlap=nperseg//2, detrend="linear",
 * scaling="density") with a one-sided spectrum. Direct DFT: segments are a few hundred samples.
 */
export function welch(x: number[], fs: number, nperseg: number): { f: number[]; p: number[] } {
  const step = nperseg - (nperseg >> 1);
  const nseg = Math.floor((x.length - nperseg) / step) + 1;
  const win = Array.from({ length: nperseg }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nperseg)); // periodic Hann
  const scale = 1 / (fs * win.reduce((s, w) => s + w * w, 0));
  const nfreq = (nperseg >> 1) + 1;
  const p = new Array<number>(nfreq).fill(0);
  const cos = Array.from({ length: nperseg }, (_, i) => Math.cos((2 * Math.PI * i) / nperseg));
  const sin = Array.from({ length: nperseg }, (_, i) => Math.sin((2 * Math.PI * i) / nperseg));
  for (let s = 0; s < nseg; s++) {
    const seg = detrendLinear(x.slice(s * step, s * step + nperseg)).map((v, i) => v * win[i]);
    for (let k = 0; k < nfreq; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < nperseg; i++) {
        const j = (k * i) % nperseg;
        re += seg[i] * cos[j];
        im -= seg[i] * sin[j];
      }
      let v = (re * re + im * im) * scale;
      if (k > 0 && !(nperseg % 2 === 0 && k === nfreq - 1)) v *= 2; // one-sided: fold negative frequencies
      p[k] += v / nseg;
    }
  }
  return { f: Array.from({ length: nfreq }, (_, k) => (k * fs) / nperseg), p };
}

export function segmentLength(n: number, fps: number): number {
  return Math.trunc(Math.min(n, pyRound(SEGMENT_S * fps, 0)));
}

/** Hand-centre and fingertip-minus-wrist tracks in hand-size units, gaps filled (hand_signals). */
export function handSignals(landmarks: number[][][]): { centre: number[][]; finger: number[][] } {
  const seen = landmarks.filter((pts) => !Number.isNaN(pts[WRIST][0]));
  const fail = () => new TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.");
  if (seen.length < 2) throw fail();
  const scale = median(seen.map((pts) => Math.hypot(pts[WRIST][0] - pts[MIDDLE_MCP][0], pts[WRIST][1] - pts[MIDDLE_MCP][1])));
  if (scale <= 1e-6) throw fail();
  const cx: number[] = [], cy: number[] = [], fx: number[] = [], fy: number[] = [];
  for (const pts of landmarks) {
    let sx = 0, sy = 0;
    for (const [x, y] of pts) {
      sx += x;
      sy += y;
    }
    cx.push(sx / pts.length / scale);
    cy.push(sy / pts.length / scale);
    fx.push((pts[INDEX_TIP][0] - pts[WRIST][0]) / scale);
    fy.push((pts[INDEX_TIP][1] - pts[WRIST][1]) / scale);
  }
  const zip = (a: number[], b: number[]) => a.map((v, i) => [v, b[i]]);
  return { centre: zip(fillGaps(cx), fillGaps(cy)), finger: zip(fillGaps(fx), fillGaps(fy)) };
}

export function tremorMetrics(landmarks: number[][][], fps: number): TremorMetrics {
  const { centre, finger } = handSignals(landmarks);
  if (centre.length < fps) throw new TaskNotCompleted("The video was too short. Please hold your hand still in view for 10 seconds.");
  const nper = segmentLength(centre.length, fps);
  const col = (a: number[][], j: number) => a.map((r) => r[j]);
  const { f, p: px } = welch(col(centre, 0), fps, nper);
  const py = welch(col(centre, 1), fps, nper).p;
  const fxp = welch(col(finger, 0), fps, nper).p;
  const fyp = welch(col(finger, 1), fps, nper).p;
  const p = px.map((v, i) => v + py[i]);
  const pf = fxp.map((v, i) => v + fyp[i]);
  const df = f[1] - f[0];
  const band = f.map((v) => v >= BAND_LO && v <= BAND_HI);
  if (!band.some(Boolean)) {
    throw new TaskNotCompleted("The video frame rate is too low. Use your phone's normal video mode (not slow-mo or time-lapse).");
  }
  let k = -1;
  for (let i = 0; i < p.length; i++) if (band[i] && (k < 0 || p[i] > p[k])) k = i;
  let freq = f[k];
  if (k > 0 && k < p.length - 1) {
    const den = p[k - 1] - 2 * p[k] + p[k + 1];
    if (den < 0) freq += ((0.5 * (p[k - 1] - p[k + 1])) / den) * df;
  }
  const sumWhere = (arr: number[], keep: (i: number) => boolean) => arr.reduce((s, v, i) => (keep(i) ? s + v : s), 0);
  const bandPower = sumWhere(p, (i) => band[i]) * df;
  const total = sumWhere(p, (i) => f[i] >= MOTION_MIN_HZ) * df;
  const medianBand = median(p.filter((_, i) => band[i]));
  return {
    freq_hz: freq,
    freq_unc: df / 2,
    amplitude: 2 * Math.SQRT2 * Math.sqrt(bandPower),
    power_ratio: total > 0 ? bandPower / total : 0,
    peak_prominence: medianBand > 0 ? Math.log10(Math.max(p[k] / medianBand, 1)) : 0,
    finger_amplitude: 2 * Math.SQRT2 * Math.sqrt(sumWhere(pf, (i) => band[i]) * df),
    low_freq_motion: Math.sqrt(sumWhere(p, (i) => f[i] > 0 && f[i] < LOW_MOTION_HZ) * df),
  };
}

export function analyzeTremor(t: PreparedHandTrack, criteria: Record<string, number> = {}): ModuleResult {
  const c = { ...TREMOR_MODULE.default_criteria, ...criteria };
  const checks = handVideoChecks(t.gray_samples, t.hand_crops ?? [], c);
  checks.push(
    minValueCheck("duration_s", t.duration_s, c.duration_s, "The video was too short. Please hold your hand still in view for 10 seconds."),
    minValueCheck(
      "fps",
      t.fps,
      c.fps,
      "The video frame rate is too low for tremor. Use your phone's normal video mode at 30 fps (not slow-mo or time-lapse).",
    ),
    fractionCheck(
      "hand_visible",
      t.detection_rate,
      c.hand_visible,
      "I lost sight of your hand. Keep your whole hand, including your wrist, in the frame the entire time.",
    ),
  );
  return runPipeline(
    checks,
    () => {
      const m = tremorMetrics(t.landmarks, t.sample_fps ?? t.fps);
      const inflate = 1 / Math.max(t.detection_rate, 0.25);
      const [amp, freq, ratio] = TREMOR_MODULE.measurements;
      return {
        measurements: [measurement(amp, m.amplitude, null), measurement(freq, m.freq_hz, m.freq_unc * inflate), measurement(ratio, m.power_ratio, null)],
        features: {
          tremor_freq_hz: m.freq_hz,
          tremor_amplitude: m.amplitude,
          tremor_power_ratio: m.power_ratio,
          tremor_peak_prominence: m.peak_prominence,
          finger_tremor_amplitude: m.finger_amplitude,
          low_freq_motion: m.low_freq_motion,
          detection_rate: t.detection_rate,
          duration_s: t.duration_s,
        },
      };
    },
    `${TREMOR_MODULE.id}@${TREMOR_MODULE.version}`,
  );
}
