"""Hand tremor (rest or postural): frequency and amplitude of rhythmic hand movement.

The participant rests their forearm with the hand held still in view for 10-15 seconds, with
the phone propped up (a hand-held phone adds its own shake). From MediaPipe hand landmarks:

- hand motion: the mean of all 21 landmarks, in hand-size units (wrist to middle-finger
  knuckle, about 10 cm in adults), so it is comparable across camera distances
- finger motion: index fingertip relative to the wrist, for tremor in the fingers alone

Each signal's power spectrum (Welch, Hann window, ~4 s segments, linear detrend) gives:
- the dominant frequency in the 3-12 Hz tremor band (Parkinsonian rest tremor is typically
  4-6 Hz, essential tremor 4-12 Hz)
- the peak-to-peak amplitude of band-limited motion (2√2 × RMS, exact for a sinusoid)
- the share of movement power in the band, and how much the peak stands out within it
  (log10 of peak power over the band's median power: 0 = no peak)

The same signal math runs on-device in the browser (packages/cv/src/tremor.ts); parity is
checked against fixtures exported by app/parity.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import welch

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted
from .hands import INDEX_TIP, MIDDLE_MCP, WRIST, HandTrack, HandTracker, fill_gaps, load_hand_media

BAND_HZ = (3.0, 12.0)
MOTION_MIN_HZ = 0.5  # slower movement is posture drift, not tremor
LOW_MOTION_HZ = 2.0  # below this: voluntary movement, drift or camera motion
SEGMENT_S = 4.0
FEATURE_NAMES = [
    "tremor_freq_hz",
    "tremor_amplitude",
    "tremor_power_ratio",
    "tremor_peak_prominence",
    "finger_tremor_amplitude",
    "low_freq_motion",
    "detection_rate",
    "duration_s",
]


# ---------- pure signal math (unit-tested with synthetic signals) ----------


@dataclass
class TremorMetrics:
    freq_hz: float
    freq_unc: float
    amplitude: float  # peak-to-peak, hand-size units
    power_ratio: float
    peak_prominence: float
    finger_amplitude: float
    low_freq_motion: float


def segment_length(n: int, fps: float) -> int:
    return int(min(n, round(SEGMENT_S * fps)))


def psd(x: np.ndarray, fps: float) -> tuple[np.ndarray, np.ndarray]:
    nper = segment_length(len(x), fps)
    return welch(x, fs=fps, window="hann", nperseg=nper, noverlap=nper // 2, detrend="linear", scaling="density")


def hand_signals(landmarks: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(frames, 21, 2) pixel landmarks → hand-centre and fingertip-minus-wrist tracks
    (frames, 2) in hand-size units, gaps filled."""
    seen = ~np.isnan(landmarks[:, WRIST, 0])
    if seen.sum() < 2:
        raise TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.")
    sizes = np.linalg.norm(landmarks[seen, WRIST] - landmarks[seen, MIDDLE_MCP], axis=1)
    scale = float(np.median(sizes))
    if scale <= 1e-6:
        raise TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.")
    centre = landmarks.mean(axis=1) / scale
    finger = (landmarks[:, INDEX_TIP] - landmarks[:, WRIST]) / scale
    fill = lambda a: np.stack([fill_gaps(a[:, 0]), fill_gaps(a[:, 1])], axis=1)  # noqa: E731
    return fill(centre), fill(finger)


def tremor_metrics(landmarks: np.ndarray, fps: float) -> TremorMetrics:
    centre, finger = hand_signals(landmarks)
    if len(centre) < fps:  # under a second: frequency resolution would be worse than 1 Hz
        raise TaskNotCompleted("The video was too short. Please hold your hand still in view for 10 seconds.")
    f, px = psd(centre[:, 0], fps)
    _, py = psd(centre[:, 1], fps)
    _, fx = psd(finger[:, 0], fps)
    _, fy = psd(finger[:, 1], fps)
    p, pf = px + py, fx + fy
    df = float(f[1] - f[0])
    band = (f >= BAND_HZ[0]) & (f <= BAND_HZ[1])
    if not band.any():
        raise TaskNotCompleted("The video frame rate is too low. Use your phone's normal video mode (not slow-mo or time-lapse).")
    idx = np.flatnonzero(band)
    k = int(idx[np.argmax(p[band])])
    freq = float(f[k])
    if 0 < k < len(p) - 1:  # parabolic interpolation between frequency bins
        den = p[k - 1] - 2 * p[k] + p[k + 1]
        if den < 0:
            freq += float(0.5 * (p[k - 1] - p[k + 1]) / den) * df
    band_power = float(p[band].sum() * df)
    motion = f >= MOTION_MIN_HZ
    total = float(p[motion].sum() * df)
    median_band = float(np.median(p[band]))
    low = (f > 0) & (f < LOW_MOTION_HZ)
    return TremorMetrics(
        freq_hz=freq,
        freq_unc=df / 2,
        amplitude=2 * np.sqrt(2) * np.sqrt(band_power),
        power_ratio=band_power / total if total > 0 else 0.0,
        peak_prominence=float(np.log10(max(p[k] / median_band, 1.0))) if median_band > 0 else 0.0,
        finger_amplitude=2 * np.sqrt(2) * np.sqrt(float(pf[band].sum() * df)),
        low_freq_motion=float(np.sqrt(p[low].sum() * df)),
    )


# ---------- module ----------


@dataclass
class PreparedTremor:
    track: HandTrack
    extras: dict = field(default_factory=dict)


@register
class HandTremorModule(CVModule):
    id = "hand_tremor"
    version = "0.2.0"
    label = "Hand tremor (rest / postural)"
    media_type = "video"
    conditions = ["parkinsons", "essential_tremor"]
    components = ["blur", "exposure", "duration", "hand_visible", "hand_landmarks", "tremor_spectrum"]
    measurements = [
        MeasurementSpec("tremor_amplitude", "Tremor amplitude", "× hand size"),
        MeasurementSpec("tremor_freq_hz", "Tremor frequency", "Hz"),
        MeasurementSpec("tremor_power_ratio", "Tremor share of movement", "fraction"),
    ]
    feature_names = FEATURE_NAMES
    # blur 20 is advisory (hand region, 256 px): flags a visibly soft hand for the clinician but never
    # rejects; MediaPipe tracked and measured perfectly even at heavy defocus
    # (training/calibration/hand_video_sharpness.md). Exposure is judged on the hand region.
    default_criteria = {"blur": 20, "exposure_min": 60, "exposure_max": 220, "hand_visible": 0.8, "duration_s": 8, "fps": 24}

    def __init__(self, tracker_factory=HandTracker) -> None:
        self._tracker_factory = tracker_factory

    def prepare(self, path: str) -> PreparedTremor:
        return PreparedTremor(track=load_hand_media(path, self._tracker_factory))

    def quality_checks(self, p: PreparedTremor, c: dict[str, float]) -> list[QualityCheck]:
        t = p.track
        return q.hand_video_checks(t.gray_samples, t.sample_landmarks, c) + [
            q.min_value_check(
                "duration_s", t.duration_s, c["duration_s"], "The video was too short. Please hold your hand still in view for 10 seconds."
            ),
            q.min_value_check(
                "fps", t.fps, c["fps"], "The video frame rate is too low for tremor. Use your phone's normal video mode at 30 fps (not slow-mo or time-lapse)."
            ),
            q.fraction_check(
                "hand_visible",
                t.detection_rate,
                c["hand_visible"],
                "I lost sight of your hand. Keep your whole hand, including your wrist, in the frame the entire time.",
            ),
        ]

    def measure(self, p: PreparedTremor, c: dict[str, float]) -> MeasureResult:
        t = p.track
        m = tremor_metrics(t.landmarks, t.fps)
        inflate = 1.0 / max(t.detection_rate, 0.25)
        return MeasureResult(
            measurements=[
                self.measurement("tremor_amplitude", m.amplitude, None),
                self.measurement("tremor_freq_hz", m.freq_hz, m.freq_unc * inflate),
                self.measurement("tremor_power_ratio", m.power_ratio, None),
            ],
            features={
                "tremor_freq_hz": m.freq_hz,
                "tremor_amplitude": m.amplitude,
                "tremor_power_ratio": m.power_ratio,
                "tremor_peak_prominence": m.peak_prominence,
                "finger_tremor_amplitude": m.finger_amplitude,
                "low_freq_motion": m.low_freq_motion,
                "detection_rate": t.detection_rate,
                "duration_s": t.duration_s,
            },
        )
