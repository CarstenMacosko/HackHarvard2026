import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { factoryApiKey, resolveDroidExecPath } from "./live-keys";

export { droidConfigured } from "./live-keys";

/**
 * Ask Factory Droid to draft a task-specific analyzer via @factory/droid-sdk + @factory/cli.
 * Falls back to the hand-movement template only when FACTORY_API_KEY is unset.
 */

export interface GenerateModuleInput {
  condition: string;
  description: string;
  measurements: { name: string; label: string; unit: string }[];
  media_type: "photo" | "video";
  module_id: string;
  params: Record<string, number>;
  components: string[];
  has_clinical_labels: boolean;
}

export interface GenerateModuleResult {
  source_code: string;
  summary: string;
  missing_validation: string | null;
  mode: "live" | "demo";
}

const MODULE_CATALOG = `
Existing CV modules in this repo (reuse these; do not invent clinical scores):
- finger_tapping: MediaPipe hand landmarks → thumb–index distance → tap rate, amplitude, decrement, rhythm
- hand_tremor: MediaPipe hand landmarks → Welch spectrum → 3–12 Hz frequency, amplitude, power ratio
- eczema_photo: YCrCb skin mask → CIELAB redness / affected area (+ MobileNet embedding)
Shared helpers: services/cv/app/modules/hands.py (HandTracker), quality.py, base.CVModule contract
(prepare → quality_checks → measure + features).
`;

export function templateModuleSource(input: GenerateModuleInput): string {
  if (input.measurements.some((m) => m.name === "index_straight_fraction")) {
    const c = input.params;
    return `"""Candidate index straightening module; requires clinician validation before deployment."""
from __future__ import annotations
from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted
from .hands import HandTracker, load_hand_media
from .writing_posture_core import evaluate_track

@register
class GeneratedWritingPostureModule(CVModule):
    id = ${JSON.stringify(input.module_id)}
    version = "0.1.0-candidate"
    label = ${JSON.stringify(input.measurements[0]?.label ?? "Index straightening")}
    media_type = "video"
    conditions = ["focal_hand_dystonia"]
    components = ["hand_landmarks", "index_joint_angle"]
    measurements = [MeasurementSpec("index_straight_fraction", ${JSON.stringify(input.measurements[0]?.label ?? "Index finger straight during writing")}, ${JSON.stringify(input.measurements[0]?.unit ?? "fraction")})]
    feature_names = ["index_straight_fraction", "index_pip_angle_deg", "hold_index_pip_angle_deg", "posture_change_deg", "index_visible_fraction", "example_frame_s"]
    default_criteria = {"blur": 20, "exposure_min": 60, "exposure_max": 220, "hand_visible": 0.8,
                        "fps": 20, "duration_s": ${c.min_duration_s ?? 6}, "index_visible": ${c.min_visible ?? 0.7},
                        "hold_s": ${c.hold_s ?? 2}, "straight_deg": ${c.straight_deg ?? 160}}

    def prepare(self, path: str, start_s: float = 0.0):
        return load_hand_media(path, HandTracker, start_s)

    def quality_checks(self, track, criteria):
        result = evaluate_track(track.landmarks.tolist(), track.fps,
            hold_s=criteria["hold_s"], straight_deg=criteria["straight_deg"],
            min_visible=criteria["index_visible"], min_duration_s=criteria["duration_s"])
        return q.hand_video_checks(track.gray_samples, track.sample_landmarks, criteria) + [
            q.min_value_check("duration_s", track.duration_s, criteria["duration_s"], "Record a longer pen hold and writing video."),
            q.min_value_check("fps", track.fps, criteria["fps"], "Use normal video mode."),
            q.fraction_check("hand_visible", track.detection_rate, criteria["hand_visible"], "Keep your hand in view."),
            q.fraction_check("index_visible", result["visible_fraction"], criteria["index_visible"], "Keep the index finger visible."),
            q.fraction_check("index_hold_visible", result["hold_visible_fraction"], criteria["index_visible"], "Keep the index finger visible during pen hold."),
            QualityCheck(name="hold_and_writing", passed=result["reason"] != "incomplete_hold_or_writing", value=None,
                         threshold=None, message="Hold the pen for two seconds, then write the phrase."),
        ]

    def measure(self, track, criteria):
        result = evaluate_track(track.landmarks.tolist(), track.fps,
            hold_s=criteria["hold_s"], straight_deg=criteria["straight_deg"],
            min_visible=criteria["index_visible"], min_duration_s=criteria["duration_s"])
        if not result["accepted"]:
            raise TaskNotCompleted("Keep the index finger visible during writing.")
        return MeasureResult(
            measurements=[self.measurement("index_straight_fraction", result["straight_fraction"], None)],
            features={"index_straight_fraction": result["straight_fraction"],
                      "index_pip_angle_deg": result["writing_angle_deg"],
                      "hold_index_pip_angle_deg": result["hold_angle_deg"],
                      "posture_change_deg": result["writing_angle_deg"] - result["hold_angle_deg"],
                      "index_visible_fraction": result["visible_fraction"],
                      "example_frame_s": result["example_frame_s"]})
`;
  }
  const meas = input.measurements
    .map((m) => `        MeasurementSpec(${JSON.stringify(m.name)}, ${JSON.stringify(m.label)}, ${JSON.stringify(m.unit)}),`)
    .join("\n");
  const featureNames = input.measurements.map((m) => m.name).concat(["detection_rate", "duration_s", "band_power_ratio"]);
  const p = input.params;
  return `"""Generated by Factory Droid for: ${input.description.replace(/"/g, "'")}
Module id: ${input.module_id}
Reuses: ${input.components.join(", ")}
Params tuned in Daytona sandboxes: ${JSON.stringify(p)}
${input.has_clinical_labels ? "" : "No clinical labels were provided — this is an interpretable feature extractor only."}
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted
from .hands import WRIST, HandTrack, load_hand_media
from .hand_tremor import hand_signals, psd

BAND_HZ = (${p.band_lo_hz ?? 3}, ${p.band_hi_hz ?? 12})
FEATURE_NAMES = ${JSON.stringify(featureNames)}


@dataclass
class MovementMetrics:
    values: dict[str, float]


def movement_metrics(landmarks: np.ndarray, fps: float) -> MovementMetrics:
    centre, _finger = hand_signals(landmarks)
    if len(centre) < fps:
        raise TaskNotCompleted("The video was too short. Hold your hand in view for about 10 seconds.")
    f, px = psd(centre[:, 0], fps)
    _, py = psd(centre[:, 1], fps)
    power = px + py
    band = (f >= BAND_HZ[0]) & (f <= BAND_HZ[1])
    if not band.any():
        raise TaskNotCompleted("Frame rate too low for this assessment. Use normal video mode.")
    df = float(f[1] - f[0]) if len(f) > 1 else 1.0
    band_power = float(power[band].sum() * df)
    total = float(power[f >= 0.5].sum() * df) or 1.0
    idx = int(np.flatnonzero(band)[np.argmax(power[band])])
    freq = float(f[idx])
    amp = float(2 * np.sqrt(2) * np.sqrt(band_power))
    values = {
        "detection_rate": float((~np.isnan(landmarks[:, WRIST, 0])).mean()),
        "duration_s": float(len(landmarks) / max(fps, 1e-6)),
        "band_power_ratio": band_power / total,
    }
    primary = ${JSON.stringify(input.measurements.map((m) => m.name))}
    if primary:
        values[primary[0]] = amp
    if len(primary) > 1:
        values[primary[1]] = freq
    if len(primary) > 2:
        values[primary[2]] = band_power / total
    for name in primary[3:]:
        values.setdefault(name, amp)
    return MovementMetrics(values=values)


@register
class GeneratedHandMovementModule(CVModule):
    id = ${JSON.stringify(input.module_id)}
    version = "0.1.0"
    label = ${JSON.stringify(input.measurements[0]?.label ?? "Hand movement")}
    media_type = "video"
    conditions = [${JSON.stringify(input.condition.toLowerCase().replace(/[^a-z0-9_]+/g, "_") || "other")}]
    components = ${JSON.stringify(input.components)}
    measurements = [
${meas}
    ]
    feature_names = FEATURE_NAMES
    default_criteria = {
        "blur": ${p.blur_min ?? 20},
        "exposure_min": 60,
        "exposure_max": 220,
        "hand_visible": ${p.hand_visible ?? 0.8},
        "duration_s": ${p.duration_s ?? 8},
        "fps": 20,
    }

    def prepare(self, path: str, start_s: float = 0.0) -> HandTrack:
        return load_hand_media(path, start_s=start_s)

    def quality_checks(self, track: HandTrack, c: dict[str, float]) -> list[QualityCheck]:
        rate = float((~np.isnan(track.landmarks[:, WRIST, 0])).mean())
        return q.hand_video_checks(track.gray_samples, track.sample_landmarks, c) + [
            q.min_value_check("duration_s", track.duration_s, c["duration_s"], "Record a little longer so we can measure the movement."),
            q.min_value_check("fps", track.fps, c["fps"], "Use your phone's normal video mode."),
            q.fraction_check("hand_visible", rate, c["hand_visible"], "Keep your whole hand, including the wrist, in the frame."),
        ]

    def measure(self, track: HandTrack, c: dict[str, float]) -> MeasureResult:
        m = movement_metrics(track.landmarks, track.fps)
        return MeasureResult(
            measurements=[self.measurement(spec.name, m.values.get(spec.name, 0.0), None) for spec in self.measurements],
            features={k: float(v) for k, v in m.values.items()},
        )
`;
}

export async function draftModuleWithDroid(input: GenerateModuleInput): Promise<GenerateModuleResult> {
  const missing = input.has_clinical_labels
    ? null
    : "No clinical labels were supplied. This module extracts interpretable hand-movement features only; it does not invent a clinical score. Collect labelled captures before treating any output as a study endpoint.";

  const apiKey = factoryApiKey();
  if (!apiKey) {
    return {
      source_code: templateModuleSource(input),
      summary: "Demo template: FACTORY_API_KEY unset — reused MediaPipe hand landmarks; params will be tuned in Daytona.",
      missing_validation: missing,
      mode: "demo",
    };
  }

  const execPath = resolveDroidExecPath();
  const repoRoot = resolveRepoRoot();
  const prompt = `You are generating a sandboxed CV module for the Visual Follow-Up Platform.

${MODULE_CATALOG}

Researcher request:
- condition: ${input.condition}
- description: ${input.description}
- measurements: ${JSON.stringify(input.measurements)}
- media_type: ${input.media_type}
- module_id: ${input.module_id}
- preferred default params: ${JSON.stringify(input.params)}
- has_clinical_labels: ${input.has_clinical_labels}

Rules:
1. Prefer reusing hands.py / hand_tremor / finger_tapping helpers.
2. Implement CVModule (prepare, quality_checks, measure) with patient-facing retry messages.
3. If has_clinical_labels is false, produce an interpretable feature extractor and state that validation data is missing — never invent a clinical score.
4. Return ONLY a single Python module file body (no markdown fences), suitable to save under services/cv/app/modules/.

Write the complete Python module now.`;

  try {
    const { run } = await import("@factory/droid-sdk/node");
    const result = await run(prompt, {
      apiKey,
      execPath,
      cwd: repoRoot,
      env: {
        ...process.env,
        FACTORY_API_KEY: apiKey,
      },
      autoRejectPermissionRequests: true,
    });
    const text = (result.text ?? "").trim();
    const code = stripFence(text);
    if (!code || !/class\s+\w+/.test(code)) {
      // Droid responded but without usable module code — keep the safe template, still mark live.
      return {
        source_code: templateModuleSource(input),
        summary: `Droid ran live (${execPath}) but returned no CVModule class; kept tuned template. Preview: ${text.slice(0, 160)}`,
        missing_validation: missing,
        mode: "live",
      };
    }
    return {
      source_code: code,
      summary: result.success
        ? `Factory Droid drafted the analyzer (live · ${execPath}).`
        : `Droid finished with warnings; using returned source. ${result.error?.message ?? ""}`.trim(),
      missing_validation: missing,
      mode: "live",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Key is set — do not silently pretend demo succeeded without saying so.
    return {
      source_code: templateModuleSource(input),
      summary: `Droid live call failed (${msg}); using safe template so Daytona can still tune params.`,
      missing_validation: missing,
      mode: "live",
    };
  }
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  for (const c of [cwd, path.join(cwd, ".."), path.join(cwd, "../..")]) {
    if (existsSync(path.join(c, "services/cv/app/modules/base.py"))) return c;
  }
  return cwd;
}

function stripFence(text: string): string {
  const m = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (m?.[1] ?? text).trim();
}

export function pickComponents(description: string, mediaType: "photo" | "video"): string[] {
  const d = description.toLowerCase();
  if (mediaType === "photo" || /skin|eczema|psoriasis|rash|lesion/.test(d)) {
    return ["blur", "exposure", "skin_coverage", "skin_mask", "erythema_index", "color_texture_features"];
  }
  if (/tap|finger/.test(d)) {
    return ["blur", "exposure", "duration", "hand_visible", "hand_landmarks", "tap_kinematics", "tap_features"];
  }
  return ["blur", "exposure", "duration", "hand_visible", "hand_landmarks", "tremor_spectrum"];
}
