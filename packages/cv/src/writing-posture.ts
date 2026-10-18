import { fractionCheck, handVideoChecks, measurement, minValueCheck, runPipeline, TaskNotCompleted, type ModuleResult } from "./quality";
import type { PreparedHandTrack } from "./tapping";

/** Mirror of services/cv writing_posture + writing_posture_core (index PIP during hold/write). */
export const WRITING_POSTURE_MODULE = {
  id: "writing_posture",
  version: "0.1.0",
  media_type: "video" as const,
  measurements: [
    { name: "index_straight_fraction", label: "Index finger straight during writing", unit: "fraction" },
    { name: "index_pip_angle_deg", label: "Mean index PIP angle during writing", unit: "degrees" },
  ],
  feature_names: [
    "index_straight_fraction",
    "index_pip_angle_deg",
    "hold_index_pip_angle_deg",
    "knuckle_palm_angle_deg",
    "posture_change_deg",
    "example_frame_s",
    "index_visible_fraction",
    "duration_s",
  ],
  default_criteria: {
    blur: 20,
    exposure_min: 60,
    exposure_max: 220,
    hand_visible: 0.8,
    index_visible: 0.7,
    duration_s: 6,
    fps: 20,
    hold_s: 2,
    straight_deg: 160,
  } as Record<string, number>,
};

const WRIST = 0;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_DIP = 7;

function jointAngle(a: number[], b: number[], c: number[]): number | null {
  try {
    if (!a || !b || !c) return null;
    if ([a, b, c].some((p) => p.some((v) => !Number.isFinite(v)))) return null;
    const ux = a[0] - b[0];
    const uy = a[1] - b[1];
    const vx = c[0] - b[0];
    const vy = c[1] - b[1];
    const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (den < 1e-6) return null;
    const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / den));
    return (Math.acos(cos) * 180) / Math.PI;
  } catch {
    return null;
  }
}

function indexPipAngle(frame: number[][]): number | null {
  return jointAngle(frame[INDEX_MCP], frame[INDEX_PIP], frame[INDEX_DIP]);
}

/** Angle at index MCP between wrist and PIP — knuckle / palm posture (not PIP flexion). */
function knucklePalmAngle(frame: number[][]): number | null {
  return jointAngle(frame[WRIST], frame[INDEX_MCP], frame[INDEX_PIP]);
}

function meanAngle(
  frames: number[][][],
  start: number,
  angleFn: (frame: number[][]) => number | null,
): number | null {
  const vals = frames.slice(start).map(angleFn).filter((a): a is number => a != null);
  if (!vals.length) return null;
  return vals.reduce((s, a) => s + a, 0) / vals.length;
}

export function evaluateWritingTrack(
  frames: number[][][],
  fps: number,
  opts: { hold_s?: number; straight_deg?: number; min_visible?: number; min_duration_s?: number } = {},
): {
  accepted: boolean;
  reason: string | null;
  visible_fraction: number;
  hold_visible_fraction: number;
  duration_s: number;
  hold_angle_deg?: number;
  writing_angle_deg?: number;
  straight_fraction?: number;
  example_frame_s?: number;
} {
  const hold_s = opts.hold_s ?? 2;
  const straight_deg = opts.straight_deg ?? 160;
  const min_visible = opts.min_visible ?? 0.7;
  const min_duration_s = opts.min_duration_s ?? 6;
  if (fps <= 0 || !frames.length) {
    return { accepted: false, reason: "empty_or_invalid_track", visible_fraction: 0, hold_visible_fraction: 0, duration_s: 0 };
  }
  const angles = frames.map(indexPipAngle);
  const split = Math.max(1, Math.round(hold_s * fps));
  const hold = angles.slice(0, split).filter((a): a is number => a != null);
  const writing = angles
    .slice(split)
    .map((a, i) => [i + split, a] as const)
    .filter((x): x is readonly [number, number] => x[1] != null);
  const writingFrames = Math.max(0, frames.length - split);
  const visible = writingFrames ? writing.length / writingFrames : 0;
  const holdVisible = hold.length / Math.min(split, frames.length);
  const duration_s = frames.length / fps;
  if (duration_s < min_duration_s || holdVisible < min_visible || !writing.length) {
    return {
      accepted: false,
      reason: "incomplete_hold_or_writing",
      visible_fraction: visible,
      hold_visible_fraction: holdVisible,
      duration_s,
    };
  }
  if (visible < min_visible) {
    return {
      accepted: false,
      reason: "index_landmarks_not_visible",
      visible_fraction: visible,
      hold_visible_fraction: holdVisible,
      duration_s,
    };
  }
  const values = writing.map(([, a]) => a);
  const ordered = [...values].sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  const example = writing.reduce((best, cur) => (Math.abs(cur[1] - median) < Math.abs(best[1] - median) ? cur : best));
  return {
    accepted: true,
    reason: null,
    visible_fraction: visible,
    hold_visible_fraction: holdVisible,
    duration_s,
    hold_angle_deg: hold.reduce((s, a) => s + a, 0) / hold.length,
    writing_angle_deg: values.reduce((s, a) => s + a, 0) / values.length,
    straight_fraction: values.filter((a) => a >= straight_deg).length / values.length,
    example_frame_s: example[0] / fps,
  };
}

/** Analyse a prepared hand track like WritingPostureModule. `moduleId` lets gen_* tasks report their own version string. */
export function analyzeWritingPosture(track: PreparedHandTrack, criteria: Record<string, number> = {}, moduleId = "writing_posture"): ModuleResult {
  const c = { ...WRITING_POSTURE_MODULE.default_criteria, ...criteria };
  // Landmarks are sampled at sample_fps; native fps is only for quality checks.
  const result = evaluateWritingTrack(track.landmarks, track.sample_fps ?? track.fps, {
    hold_s: c.hold_s,
    straight_deg: c.straight_deg,
    min_visible: c.index_visible,
    min_duration_s: c.duration_s,
  });
  const checks = [
    ...handVideoChecks(track.gray_samples, track.hand_crops ?? [], c),
    minValueCheck("duration_s", track.duration_s, c.duration_s, "Record at least six seconds: hold the pen still, then write the same short phrase."),
    minValueCheck("fps", track.fps, c.fps, "Use normal video mode at 30 fps."),
    fractionCheck("hand_visible", track.detection_rate, c.hand_visible, "Keep your hand and wrist in view from the side."),
    fractionCheck("index_visible", result.visible_fraction, c.index_visible, "Keep your index finger visible while writing."),
    fractionCheck("index_hold_visible", result.hold_visible_fraction, c.index_visible, "Keep your index finger visible during the two-second pen hold."),
    {
      name: "hold_and_writing",
      passed: result.reason !== "incomplete_hold_or_writing",
      value: null,
      threshold: null,
      message: "Hold the pen for two seconds, then write the short phrase with your index finger visible.",
      advisory: false as const,
    },
  ];
  const [straightSpec, pipSpec] = WRITING_POSTURE_MODULE.measurements;
  return runPipeline(
    checks,
    () => {
      if (!result.accepted) throw new TaskNotCompleted("Keep the index finger visible during both pen hold and writing.");
      const straight = result.straight_fraction!;
      const writingAngle = result.writing_angle_deg!;
      const holdAngle = result.hold_angle_deg!;
      const split = Math.max(1, Math.round(c.hold_s * (track.sample_fps ?? track.fps)));
      const knuckle = meanAngle(track.landmarks, split, knucklePalmAngle);
      return {
        measurements: [measurement(straightSpec, straight, null), measurement(pipSpec, writingAngle, null)],
        features: {
          index_straight_fraction: straight,
          index_pip_angle_deg: writingAngle,
          hold_index_pip_angle_deg: holdAngle,
          ...(knuckle != null ? { knuckle_palm_angle_deg: knuckle } : {}),
          posture_change_deg: writingAngle - holdAngle,
          example_frame_s: result.example_frame_s!,
          index_visible_fraction: result.visible_fraction,
          duration_s: result.duration_s,
        },
      };
    },
    `${moduleId}@${WRITING_POSTURE_MODULE.version}`,
  );
}
