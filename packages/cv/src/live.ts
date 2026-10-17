import { INDEX_TIP, MIDDLE_MCP, MIN_TAP_SPREAD, THUMB_TIP, WRIST } from "./tapping";

/**
 * Live capture coaching: turns per-frame hand landmarks (and occasional hand-region brightness
 * and sharpness) into one instruction at a time, like a banking app guiding a cheque photo.
 *
 * Guidance is about the *capture* (framing, light, distance, steadiness), never about the
 * performance being measured: telling someone to tap faster or wider would change the result.
 */

export type GuidanceLevel = "bad" | "warn" | "good";

export interface Guidance {
  code: "no_hand" | "dark" | "bright" | "edge" | "far" | "close" | "unsteady" | "soft" | "good";
  level: GuidanceLevel;
  message: string;
}

export interface LiveFrame {
  /** time of the frame in ms (any monotonic clock) */
  t: number;
  /** 21 hand landmarks in pixels, or null if no hand was found */
  pts: number[][] | null;
  width: number;
  height: number;
  /** mean brightness (0-255) of the hand region, or of the whole frame when no hand is found */
  brightness?: number | null;
  /** Laplacian variance of the 256 px hand crop, when it was measured for this frame */
  sharpness?: number | null;
}

export const LIVE = {
  /** hand box (longest side) as a fraction of the frame's shorter side */
  minHand: 0.25,
  maxHand: 0.95,
  /** landmarks closer than this to the frame edge (fraction of width/height) risk being cut off */
  edge: 0.02,
  dark: 60, // match the blocking exposure check (finger_tapping default_criteria)
  bright: 220,
  soft: 20, // the advisory sharpness flag
  /** wrist travel over the last second, in hand sizes, that counts as the whole hand moving */
  unsteady: 0.6,
  /** framing must stay good this long before tapping is invited */
  settleMs: 1000,
} as const;

export const LIVE_MESSAGES = {
  no_hand: "Show your whole hand to the camera, wrist included",
  dark: "Too dark: turn on a light or face a window",
  bright: "Too bright: move out of direct sunlight",
  edge: "Move your hand toward the middle of the screen",
  far: "Move a little closer",
  close: "Move back a little so your whole hand fits",
  unsteady: "Rest your forearm on the table to keep your hand steady",
  soft: "Hold still and tap the screen on your hand to focus",
  good: "Looks good",
} as const;

const handSize = (pts: number[][]) => Math.hypot(pts[WRIST][0] - pts[MIDDLE_MCP][0], pts[WRIST][1] - pts[MIDDLE_MCP][1]);

/** One instruction for the current frame, most important problem first. */
export function frameGuidance(f: LiveFrame, wristTravel = 0): Guidance {
  const g = (code: Guidance["code"], level: GuidanceLevel): Guidance => ({ code, level, message: LIVE_MESSAGES[code] });
  // light first: in a dark room the hand often can't be found at all
  if (f.brightness != null && f.brightness < LIVE.dark) return g("dark", "bad");
  if (f.brightness != null && f.brightness > LIVE.bright) return g("bright", "bad");
  if (!f.pts) return g("no_hand", "bad");
  const xs = f.pts.map((p) => p[0]), ys = f.pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ex = LIVE.edge * f.width, ey = LIVE.edge * f.height;
  const box = Math.max(x1 - x0, y1 - y0) / Math.min(f.width, f.height);
  if (box > LIVE.maxHand) return g("close", "bad");
  if (x0 < ex || y0 < ey || x1 > f.width - ex || y1 > f.height - ey) return g("edge", "bad");
  if (box < LIVE.minHand) return g("far", "bad");
  if (wristTravel > LIVE.unsteady) return g("unsteady", "warn");
  if (f.sharpness != null && f.sharpness < LIVE.soft) return g("soft", "warn");
  return g("good", "good");
}

export type CoachPhase = "framing" | "ready" | "tapping";

export interface CoachState {
  phase: CoachPhase;
  guidance: Guidance;
  taps: number;
  /** time of the first tap, once tapping has started */
  tapStart: number | null;
  /** ms of the target duration recorded since the first tap */
  elapsed: number;
  done: boolean;
}

/**
 * Stateful coach for the finger-tapping task: framing → ready (good framing held for a second)
 * → tapping (first taps detected) → done after `durationMs` of tapping.
 *
 * Taps are counted online from the thumb–index distance (in hand sizes) with hysteresis between
 * the recent minimum and maximum, so the count works at any opening size and frame rate.
 */
export class TappingCoach {
  private hist: { t: number; d: number | null; wrist: number[] | null; size: number | null }[] = [];
  private goodSince: number | null = null;
  private open = false;
  private taps = 0;
  private tapStart: number | null = null;
  private phase: CoachPhase = "framing";
  private lastBrightness: number | null = null;
  private lastSharpness: number | null = null;

  constructor(private readonly durationMs = 10_000) {}

  push(f: LiveFrame): CoachState {
    if (f.brightness != null) this.lastBrightness = f.brightness;
    if (f.sharpness != null) this.lastSharpness = f.sharpness;
    const size = f.pts ? handSize(f.pts) : null;
    const d = f.pts && size && size > 1e-6 ? Math.hypot(f.pts[THUMB_TIP][0] - f.pts[INDEX_TIP][0], f.pts[THUMB_TIP][1] - f.pts[INDEX_TIP][1]) / size : null;
    this.hist.push({ t: f.t, d, wrist: f.pts ? f.pts[WRIST] : null, size });
    while (this.hist.length && this.hist[0].t < f.t - 2000) this.hist.shift();

    const guidance = frameGuidance({ ...f, brightness: this.lastBrightness, sharpness: this.lastSharpness }, this.wristTravel(f.t));
    this.countTaps(f.t);

    if (this.phase !== "tapping") {
      const ok = guidance.level !== "bad";
      this.goodSince = ok ? (this.goodSince ?? f.t) : null;
      this.phase = this.goodSince !== null && f.t - this.goodSince >= LIVE.settleMs ? "ready" : "framing";
      // two taps once framed: the test has begun (counting restarts so pre-roll fidgeting doesn't count)
      if (this.phase === "ready" && this.taps >= 2 && this.tapStart !== null) this.phase = "tapping";
      else if (this.phase !== "ready") {
        this.taps = 0;
        this.tapStart = null;
      }
    }
    const elapsed = this.phase === "tapping" && this.tapStart !== null ? f.t - this.tapStart : 0;
    return { phase: this.phase, guidance, taps: this.taps, tapStart: this.tapStart, elapsed, done: elapsed >= this.durationMs };
  }

  /** Wrist travel over the last second, in hand sizes (whole-hand movement, not finger taps). */
  private wristTravel(now: number): number {
    const recent = this.hist.filter((h) => h.wrist && h.size && h.t >= now - 1000);
    if (recent.length < 2) return 0;
    const size = recent.reduce((s, h) => s + h.size!, 0) / recent.length;
    const xs = recent.map((h) => h.wrist![0]), ys = recent.map((h) => h.wrist![1]);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / size;
  }

  private countTaps(now: number) {
    const ds = this.hist.filter((h) => h.d !== null).map((h) => h.d!);
    const cur = this.hist[this.hist.length - 1]?.d;
    if (cur == null || ds.length < 4) return;
    const lo = Math.min(...ds), hi = Math.max(...ds);
    if (hi - lo < MIN_TAP_SPREAD) return; // landmark noise, not tapping
    if (!this.open && cur > lo + 0.6 * (hi - lo)) {
      this.open = true;
      this.taps++;
      if (this.tapStart === null) this.tapStart = now;
    } else if (this.open && cur < lo + 0.35 * (hi - lo)) {
      this.open = false;
    }
  }
}
