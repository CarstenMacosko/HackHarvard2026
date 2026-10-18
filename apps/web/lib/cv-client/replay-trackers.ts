/**
 * Landmark-derived realtime trackers for video replay graphs.
 *
 * To add a new feature type: append one entry to REPLAY_TRACKERS.
 * Resolution walks the list in order; the first matching tracker wins.
 *
 * Importers: apps/web/components/video-replay.tsx (resolve + sample + format).
 * User: "you should make this iterable so that if i add a new feature type that it
 * automatically has a built in tracker. a bunch of if loops is probably not the right direction."
 */

export type ReplayMeasurement = { name: string; label: string; unit: string };

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_DIP = 7;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const STRAIGHT_DEG = 160;

export type TrackerAxis = "angle" | "fraction" | "auto";

export type TrackerSampleCtx = {
  pts: number[][];
  palm: number[];
  prevPalm: number[] | null;
  handSize: number;
};

export type ReplayTracker = {
  /** Stable id used as the sample-cache key. */
  id: string;
  /** Display unit for the graph chrome. */
  unit: string;
  /** Y-axis scale policy. */
  axis: TrackerAxis;
  /** Optional horizontal guide line. */
  guide?: number;
  /** True when this measurement (or module) should use this tracker. */
  match: (m: ReplayMeasurement, module: string) => boolean;
  /** Per-frame scalar from MediaPipe landmarks. */
  sample: (ctx: TrackerSampleCtx) => number | null;
  /** Fallback label if the matched measurement has none. */
  defaultLabel?: string;
};

export type ResolvedTracker = {
  id: string;
  label: string;
  unit: string;
  axis: TrackerAxis;
  guide?: number;
  sample: ReplayTracker["sample"];
};

function jointAngle(a: number[], b: number[], c: number[]): number | null {
  if ([a, b, c].some((p) => !p || p.some((v) => !Number.isFinite(v)))) return null;
  const ux = a[0] - b[0];
  const uy = a[1] - b[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (den < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Ordered registry. More specific matchers first so PIP never steals a custom angle.
 * Add new feature trackers here — video replay picks them up automatically.
 */
export const REPLAY_TRACKERS: ReplayTracker[] = [
  {
    id: "pip_angle",
    unit: "°",
    axis: "angle",
    guide: STRAIGHT_DEG,
    match: (m) => m.name === "index_pip_angle_deg" || /pip_angle/i.test(m.name),
    sample: ({ pts }) => jointAngle(pts[INDEX_MCP], pts[INDEX_PIP], pts[INDEX_DIP]),
  },
  {
    id: "knuckle_angle",
    unit: "°",
    axis: "angle",
    match: (m) =>
      (/angle/i.test(m.name) && !/pip/i.test(m.name)) ||
      (/deg/i.test(m.unit) && !/pip/i.test(m.name) && !/straight/i.test(m.name)),
    sample: ({ pts }) => jointAngle(pts[WRIST], pts[INDEX_MCP], pts[INDEX_PIP]),
  },
  {
    id: "straightness",
    unit: "fraction",
    axis: "fraction",
    guide: 0.5,
    match: (m) => m.name === "index_straight_fraction" || /straight/i.test(m.name),
    sample: ({ pts }) => {
      const pip = jointAngle(pts[INDEX_MCP], pts[INDEX_PIP], pts[INDEX_DIP]);
      return pip == null ? null : pip >= STRAIGHT_DEG ? 1 : 0;
    },
  },
  {
    id: "tip_gap",
    unit: "× hand",
    axis: "auto",
    defaultLabel: "Thumb–index gap",
    match: (m, module) =>
      module === "finger_tapping" || /tap|amplitude_norm|amplitude|rhythm/i.test(m.name),
    sample: ({ pts, handSize }) =>
      Math.hypot(pts[THUMB_TIP][0] - pts[INDEX_TIP][0], pts[THUMB_TIP][1] - pts[INDEX_TIP][1]) / handSize,
  },
  {
    id: "hand_motion",
    unit: "× hand",
    axis: "auto",
    defaultLabel: "Hand motion",
    match: (m, module) => module === "hand_tremor" || /tremor/i.test(m.name),
    sample: ({ palm, prevPalm, handSize }) => {
      if (!prevPalm) return 0;
      return Math.hypot(palm[0] - prevPalm[0], palm[1] - prevPalm[1]) / handSize;
    },
  },
];

/** Module-level fallbacks when no measurement matched a tracker by name. */
const MODULE_FALLBACKS: Array<{ module: RegExp | string; trackerId: string }> = [
  { module: "finger_tapping", trackerId: "tip_gap" },
  { module: "hand_tremor", trackerId: "hand_motion" },
  { module: /^gen_/, trackerId: "knuckle_angle" },
  { module: "writing_posture", trackerId: "knuckle_angle" },
];

function trackerById(id: string): ReplayTracker | undefined {
  return REPLAY_TRACKERS.find((t) => t.id === id);
}

/** Resolve the realtime series for an observation’s measurements + module. */
export function resolveReplayTracker(measurements: ReplayMeasurement[], module = ""): ResolvedTracker | null {
  for (const tracker of REPLAY_TRACKERS) {
    const hit = measurements.find((m) => tracker.match(m, module));
    if (hit) {
      return {
        id: tracker.id,
        label: hit.label || tracker.defaultLabel || tracker.id,
        unit: tracker.unit,
        axis: tracker.axis,
        guide: tracker.guide,
        sample: tracker.sample,
      };
    }
  }

  for (const fb of MODULE_FALLBACKS) {
    const ok = typeof fb.module === "string" ? module === fb.module : fb.module.test(module);
    if (!ok) continue;
    const tracker = trackerById(fb.trackerId);
    if (!tracker) continue;
    const label = measurements[0]?.label || tracker.defaultLabel || tracker.id;
    return {
      id: tracker.id,
      label,
      unit: tracker.unit,
      axis: tracker.axis,
      guide: tracker.guide,
      sample: tracker.sample,
    };
  }

  if (measurements[0]) {
    const tracker = trackerById("tip_gap") ?? REPLAY_TRACKERS[0];
    if (!tracker) return null;
    return {
      id: tracker.id,
      label: measurements[0].label,
      unit: tracker.unit,
      axis: tracker.axis,
      guide: tracker.guide,
      sample: tracker.sample,
    };
  }

  return null;
}

export function sampleTracker(
  tracker: ResolvedTracker,
  pts: number[][] | null,
  prevPalm: number[] | null,
): { value: number | null; palm: number[] | null } {
  if (!pts || pts.length < 10) return { value: null, palm: prevPalm };
  const palm: number[] = [(pts[WRIST][0] + pts[MIDDLE_MCP][0]) / 2, (pts[WRIST][1] + pts[MIDDLE_MCP][1]) / 2];
  const size = Math.hypot(pts[MIDDLE_MCP][0] - pts[WRIST][0], pts[MIDDLE_MCP][1] - pts[WRIST][1]) || 1;
  return { value: tracker.sample({ pts, palm, prevPalm, handSize: size }), palm };
}

/** Format a live readout for the graph chrome. */
export function formatTrackerValue(tracker: ResolvedTracker, value: number): string {
  if (tracker.axis === "angle") return `${value.toFixed(1)}°`;
  if (tracker.axis === "fraction") return value.toFixed(0);
  return value.toFixed(3);
}
