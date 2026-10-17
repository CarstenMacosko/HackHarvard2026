"""Parkinson's finger tapping (MDS-UPDRS 3.4-style task).

Signal: per-frame thumb-tip ↔ index-tip distance, normalised by hand size
(wrist ↔ middle-finger MCP) so it is comparable across camera distances.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from scipy.signal import find_peaks, savgol_filter

from .. import quality as q
from ..models import Measurement, QualityCheck
from ..registry import register
from .base import CVModule, MeasurementSpec, TaskNotCompleted

THUMB_TIP, INDEX_TIP, WRIST, MIDDLE_MCP = 4, 8, 0, 9
MAX_TAP_HZ = 8.0


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


def fill_gaps(signal: np.ndarray) -> np.ndarray:
    """Linear-interpolate missing (NaN) frames; edges take the nearest value."""
    x = np.asarray(signal, dtype=float)
    ok = ~np.isnan(x)
    if ok.sum() < 2:
        raise TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.")
    idx = np.arange(len(x))
    return np.interp(idx, idx[ok], x[ok])


def tap_metrics(distance: np.ndarray, fps: float, detection_rate: float = 1.0) -> TapMetrics:
    d = fill_gaps(distance)
    win = max(5, int(fps * 0.1) | 1)  # ~100 ms, odd
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
    )


# ---------- media decoding + landmark extraction ----------


@dataclass
class PreparedVideo:
    fps: float
    duration_s: float
    gray_samples: list[np.ndarray]
    distance: np.ndarray  # NaN where no hand detected
    detection_rate: float
    hand_label: str | None = None
    extras: dict = field(default_factory=dict)


def extract_hand_distance(frames_rgb: list[np.ndarray]) -> tuple[np.ndarray, str | None]:
    """MediaPipe Hands → normalised thumb–index distance per frame (NaN if no hand)."""
    import mediapipe as mp  # heavy optional dependency, see requirements-mediapipe.txt

    out = np.full(len(frames_rgb), np.nan)
    handedness: list[str] = []
    with mp.solutions.hands.Hands(
        static_image_mode=False, max_num_hands=1, min_detection_confidence=0.5, min_tracking_confidence=0.5
    ) as hands:
        for i, frame in enumerate(frames_rgb):
            res = hands.process(frame)
            if not res.multi_hand_landmarks:
                continue
            lm = res.multi_hand_landmarks[0].landmark
            pt = lambda k: np.array([lm[k].x, lm[k].y])  # noqa: E731
            scale = np.linalg.norm(pt(WRIST) - pt(MIDDLE_MCP))
            if scale > 1e-6:
                out[i] = np.linalg.norm(pt(THUMB_TIP) - pt(INDEX_TIP)) / scale
            if res.multi_handedness:
                handedness.append(res.multi_handedness[0].classification[0].label)
    label = max(set(handedness), key=handedness.count) if handedness else None
    return out, label


def read_video(path: str, max_frames: int = 900) -> tuple[list[np.ndarray], float]:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise TaskNotCompleted("I couldn't open that video. Please try recording it again.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = []
    while len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames, float(fps)


@register
class FingerTappingModule(CVModule):
    id = "finger_tapping"
    version = "0.1.0"
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
    default_criteria = {"blur": 60, "exposure_min": 60, "exposure_max": 200, "hand_visible": 0.8, "duration_s": 8, "fps": 20}

    def prepare(self, path: str) -> PreparedVideo:
        frames, fps = read_video(path)
        if not frames:
            raise TaskNotCompleted("That video looks empty. Please record it again.")
        step = max(1, len(frames) // 10)
        grays = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames[::step]]
        distance, hand = extract_hand_distance(frames)
        return PreparedVideo(
            fps=fps,
            duration_s=len(frames) / fps,
            gray_samples=grays,
            distance=distance,
            detection_rate=float((~np.isnan(distance)).mean()),
            hand_label=hand,
        )

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

    def measure(self, p: PreparedVideo, c: dict[str, float]) -> list[Measurement]:
        m = tap_metrics(p.distance, p.fps, p.detection_rate)
        return [
            self.measurement("tap_rate_hz", m.tap_rate_hz, m.tap_rate_unc),
            self.measurement("amplitude_norm", m.amplitude, m.amplitude_unc),
            self.measurement("amplitude_decrement", m.decrement_pct, None),
            self.measurement("rhythm_cv", m.rhythm_cv, None),
        ]
