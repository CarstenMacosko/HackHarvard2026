"""Parkinson's finger tapping (MDS-UPDRS 3.4-style task).

Signal: per-frame thumb-tip ↔ index-tip distance, normalised by hand size
(wrist ↔ middle-finger MCP) so it is comparable across camera distances. Distances are
measured in pixels, so non-square frames are not distorted.

The same signal math runs on-device in the browser (packages/cv/src/tapping.ts).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import find_peaks, savgol_filter

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted
from .hands import (  # noqa: F401  (hand_model_path re-exported for callers and tests)
    INDEX_TIP,
    MIDDLE_MCP,
    THUMB_TIP,
    WRIST,
    HandTrack,
    HandTracker,
    fill_gaps,
    hand_model_path,
    load_hand_media,
)

MAX_TAP_HZ = 8.0
# smallest thumb–index opening range (hand widths) that counts as tapping; landmark noise on a
# still hand spans about 0.03, and "can barely perform" tapping still opens about 0.15
MIN_TAP_SPREAD = 0.08
FEATURE_NAMES = [
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
]


# ---------- pure signal math (unit-tested with synthetic signals) ----------


@dataclass
class TapMetrics:
    n_taps: int
    tap_rate_hz: float
    tap_rate_unc: float
    amplitude: float
    amplitude_unc: float
    decrement_pct: float
    rhythm_cv: float
    amplitude_cv: float
    rate_first_half: float
    rate_second_half: float


def smooth_window(fps: float) -> int:
    return max(5, int(fps * 0.1) | 1)  # ~100 ms, odd


def tap_metrics(distance: np.ndarray, fps: float, detection_rate: float = 1.0) -> TapMetrics:
    d = fill_gaps(distance)
    win = smooth_window(fps)
    if len(d) > win:
        d = savgol_filter(d, win, 2)
    spread = np.percentile(d, 95) - np.percentile(d, 5)
    if spread < MIN_TAP_SPREAD:
        raise TaskNotCompleted("I didn't see any taps. Tap your index finger and thumb together, opening wide each time.")
    peaks, _ = find_peaks(d, distance=max(1, int(fps / MAX_TAP_HZ)), prominence=0.3 * spread)
    if len(peaks) < 4:
        raise TaskNotCompleted(
            "I only saw a few taps. Please tap continuously for the full 10 seconds, as fast and wide as you can."
        )

    t = peaks / fps
    intervals = np.diff(t)
    rate = 1.0 / intervals.mean()
    # amplitude of each opening: peak height above the lowest point since the previous peak
    starts = np.concatenate([[0], peaks[:-1]])
    amps = np.array([d[p] - d[s : p + 1].min() for s, p in zip(starts, peaks)])
    third = max(1, len(amps) // 3)
    first, last = amps[:third].mean(), amps[-third:].mean()
    decrement = (first - last) / first * 100 if first > 0 else 0.0
    half = len(intervals) // 2

    # missing frames widen the uncertainty: fewer real observations behind each estimate
    inflate = 1.0 / max(detection_rate, 0.25)
    inst_rates = 1.0 / intervals
    rate_unc = inst_rates.std(ddof=1) / np.sqrt(len(inst_rates)) * inflate if len(inst_rates) > 1 else 0.0
    amp_unc = amps.std(ddof=1) / np.sqrt(len(amps)) * inflate

    return TapMetrics(
        n_taps=len(peaks),
        tap_rate_hz=float(rate),
        tap_rate_unc=float(rate_unc),
        amplitude=float(amps.mean()),
        amplitude_unc=float(amp_unc),
        decrement_pct=float(decrement),
        rhythm_cv=float(intervals.std(ddof=1) / intervals.mean()) if len(intervals) > 1 else 0.0,
        amplitude_cv=float(amps.std() / amps.mean()) if amps.mean() > 0 else 0.0,
        rate_first_half=float(1.0 / intervals[:half].mean()) if half else float(rate),
        rate_second_half=float(1.0 / intervals[half:].mean()),
    )


def hand_distance(pts: np.ndarray) -> float:
    """Thumb–index distance over wrist–middle-MCP distance; `pts` is (21, 2) in pixels."""
    scale = np.linalg.norm(pts[WRIST] - pts[MIDDLE_MCP])
    return float(np.linalg.norm(pts[THUMB_TIP] - pts[INDEX_TIP]) / scale) if scale > 1e-6 else float("nan")


# ---------- media decoding ----------


@dataclass
class PreparedVideo:
    fps: float
    duration_s: float
    gray_samples: list[np.ndarray]  # empty for landmark tracks (.npz): image checks are skipped
    distance: np.ndarray  # NaN where no hand detected
    detection_rate: float
    hand_label: str | None = None
    sample_landmarks: list = field(default_factory=list)  # hand landmarks of each gray sample (hand-region checks)
    extras: dict = field(default_factory=dict)


def from_track(track: HandTrack) -> PreparedVideo:
    distance = np.array([hand_distance(p) if not np.isnan(p[0, 0]) else np.nan for p in track.landmarks])
    return PreparedVideo(
        fps=track.fps,
        duration_s=track.duration_s,
        gray_samples=track.gray_samples,
        distance=distance,
        detection_rate=float((~np.isnan(distance)).mean()),
        hand_label=track.hand_label,
        sample_landmarks=track.sample_landmarks,
    )


def process_video(path: str, tracker_factory=HandTracker, start_s: float = 0.0) -> PreparedVideo:
    """A video (or an .npz landmark track) → per-frame thumb–index distance."""
    return from_track(load_hand_media(path, tracker_factory, start_s))


@register
class FingerTappingModule(CVModule):
    id = "finger_tapping"
    version = "0.4.0"
    label = "Finger tapping (Parkinson's)"
    media_type = "video"
    conditions = ["parkinsons"]
    components = ["blur", "exposure", "duration", "hand_visible", "hand_landmarks", "tap_kinematics"]
    measurements = [
        MeasurementSpec("tap_rate_hz", "Tap rate", "Hz"),
        MeasurementSpec("amplitude_norm", "Amplitude", "× hand size"),
        MeasurementSpec("amplitude_decrement", "Amplitude decrement", "%"),
        MeasurementSpec("rhythm_cv", "Rhythm variability", "CV"),
    ]
    feature_names = FEATURE_NAMES
    # blur 20 is advisory (hand region, 256 px): flags a visibly soft hand for the clinician but never
    # rejects; MediaPipe tracked and measured perfectly even at heavy defocus
    # (training/calibration/hand_video_sharpness.md). Exposure is judged on the hand region.
    default_criteria = {"blur": 20, "exposure_min": 60, "exposure_max": 220, "hand_visible": 0.8, "duration_s": 8, "fps": 20}

    def prepare(self, path: str, start_s: float = 0.0) -> PreparedVideo:
        return process_video(path, start_s=start_s)

    def quality_checks(self, p: PreparedVideo, c: dict[str, float]) -> list[QualityCheck]:
        checks = q.hand_video_checks(p.gray_samples, p.sample_landmarks, c)
        return checks + [
            q.min_value_check(
                "duration_s", p.duration_s, c["duration_s"], "The video was too short. Please record a full 10 seconds of tapping."
            ),
            q.min_value_check("fps", p.fps, c["fps"], "The video frame rate is too low. Use your phone's normal video mode (not slow-mo or time-lapse)."),
            q.fraction_check(
                "hand_visible",
                p.detection_rate,
                c["hand_visible"],
                "I lost sight of your hand. Keep your whole hand, including your wrist, in the frame the entire time.",
            ),
        ]

    def measure(self, p: PreparedVideo, c: dict[str, float]) -> MeasureResult:
        m = tap_metrics(p.distance, p.fps, p.detection_rate)
        return MeasureResult(
            measurements=[
                self.measurement("tap_rate_hz", m.tap_rate_hz, m.tap_rate_unc),
                self.measurement("amplitude_norm", m.amplitude, m.amplitude_unc),
                self.measurement("amplitude_decrement", m.decrement_pct, None),
                self.measurement("rhythm_cv", m.rhythm_cv, None),
            ],
            features={
                "tap_rate_hz": m.tap_rate_hz,
                "amplitude_norm": m.amplitude,
                "amplitude_decrement": m.decrement_pct,
                "rhythm_cv": m.rhythm_cv,
                "n_taps": float(m.n_taps),
                "amplitude_cv": m.amplitude_cv,
                "rate_first_half": m.rate_first_half,
                "rate_second_half": m.rate_second_half,
                "detection_rate": p.detection_rate,
                "duration_s": p.duration_s,
            },
        )
