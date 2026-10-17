"""Parkinson's finger tapping (MDS-UPDRS 3.4-style task).

Signal: per-frame thumb-tip ↔ index-tip distance, normalised by hand size
(wrist ↔ middle-finger MCP) so it is comparable across camera distances. Distances are
measured in pixels, so non-square frames are not distorted.

The same signal math runs on-device in the browser (packages/cv/src/tapping.ts).
"""
from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from scipy.signal import find_peaks, savgol_filter

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted

THUMB_TIP, INDEX_TIP, WRIST, MIDDLE_MCP = 4, 8, 0, 9
MAX_TAP_HZ = 8.0
MAX_SECONDS = 30.0
GRAY_SAMPLES = 10
HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
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


def fill_gaps(signal: np.ndarray) -> np.ndarray:
    """Linear-interpolate missing (NaN) frames; edges take the nearest value."""
    x = np.asarray(signal, dtype=float)
    ok = ~np.isnan(x)
    if ok.sum() < 2:
        raise TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.")
    idx = np.arange(len(x))
    return np.interp(idx, idx[ok], x[ok])


def smooth_window(fps: float) -> int:
    return max(5, int(fps * 0.1) | 1)  # ~100 ms, odd


def tap_metrics(distance: np.ndarray, fps: float, detection_rate: float = 1.0) -> TapMetrics:
    d = fill_gaps(distance)
    win = smooth_window(fps)
    if len(d) > win:
        d = savgol_filter(d, win, 2)
    spread = np.percentile(d, 95) - np.percentile(d, 5)
    if spread <= 1e-6:
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


def hand_distance(landmarks, width: int, height: int) -> float:
    """Thumb–index distance over wrist–middle-MCP distance, in pixel space."""
    pt = lambda k: np.array([landmarks[k].x * width, landmarks[k].y * height])  # noqa: E731
    scale = np.linalg.norm(pt(WRIST) - pt(MIDDLE_MCP))
    return float(np.linalg.norm(pt(THUMB_TIP) - pt(INDEX_TIP)) / scale) if scale > 1e-6 else float("nan")


# ---------- media decoding + landmark extraction ----------


def hand_model_path() -> str:
    """MediaPipe hand landmarker model; downloaded once into services/cv/models/ if missing."""
    path = Path(os.environ.get("HAND_LANDMARKER_MODEL") or Path(__file__).resolve().parents[2] / "models" / "hand_landmarker.task")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(HAND_MODEL_URL, tmp)
        tmp.replace(path)
    return str(path)


class HandTracker:
    """Wraps MediaPipe's HandLandmarker (Tasks API, VIDEO mode)."""

    def __init__(self) -> None:
        import mediapipe as mp  # heavy optional dependency, see requirements-mediapipe.txt
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        self._lm = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=hand_model_path()),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )

    def __enter__(self) -> "HandTracker":
        return self

    def __exit__(self, *exc) -> None:
        self._lm.close()

    def detect(self, rgb: np.ndarray, timestamp_ms: int) -> tuple[float, str | None]:
        mp = self._mp
        res = self._lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)), timestamp_ms)
        if not res.hand_landmarks:
            return float("nan"), None
        label = res.handedness[0][0].category_name if res.handedness else None
        return hand_distance(res.hand_landmarks[0], rgb.shape[1], rgb.shape[0]), label


@dataclass
class PreparedVideo:
    fps: float
    duration_s: float
    gray_samples: list[np.ndarray]
    distance: np.ndarray  # NaN where no hand detected
    detection_rate: float
    hand_label: str | None = None
    extras: dict = field(default_factory=dict)


def sample_indices(n_frames: int, k: int = GRAY_SAMPLES) -> set[int]:
    step = max(1, n_frames // k)
    return set(range(0, n_frames, step))


def process_video(path: str, tracker_factory=HandTracker) -> PreparedVideo:
    """Stream frames once: hand distance for every frame, grayscale copies of ~10 for quality."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise TaskNotCompleted("I couldn't open that video. Please try recording it again.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    max_frames = int(MAX_SECONDS * fps)
    expected = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    keep = sample_indices(min(expected, max_frames) if expected > 0 else max_frames)
    grays: list[np.ndarray] = []
    distances: list[float] = []
    labels: list[str] = []
    with tracker_factory() as tracker:
        while len(distances) < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            i = len(distances)
            if i in keep:
                grays.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
            d, label = tracker.detect(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), int(i * 1000 / fps))
            distances.append(d)
            if label:
                labels.append(label)
    cap.release()
    if not distances:
        raise TaskNotCompleted("That video looks empty. Please record it again.")
    dist = np.array(distances)
    return PreparedVideo(
        fps=float(fps),
        duration_s=len(dist) / fps,
        gray_samples=grays,
        distance=dist,
        detection_rate=float((~np.isnan(dist)).mean()),
        hand_label=max(set(labels), key=labels.count) if labels else None,
    )


@register
class FingerTappingModule(CVModule):
    id = "finger_tapping"
    version = "0.2.0"
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
    default_criteria = {"blur": 60, "exposure_min": 60, "exposure_max": 200, "hand_visible": 0.8, "duration_s": 8, "fps": 20}

    def prepare(self, path: str) -> PreparedVideo:
        return process_video(path)

    def quality_checks(self, p: PreparedVideo, c: dict[str, float]) -> list[QualityCheck]:
        sample = q.worst_frames(p.gray_samples)
        blur = min((q.blur_check(g, c["blur"]) for g in sample), key=lambda chk: chk.value or 0)
        mid = sample[len(sample) // 2]
        return [
            blur,
            q.exposure_check(mid, c["exposure_min"], c["exposure_max"]),
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
