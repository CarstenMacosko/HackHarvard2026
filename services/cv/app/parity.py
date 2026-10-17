"""Reference outputs for the on-device TypeScript port (packages/cv).

`build_fixtures()` produces synthetic skin photos and tap signals together with what the Python
modules compute for them. scripts/export_parity_fixtures.py writes them to packages/cv/fixtures,
and tests/test_parity_export.py fails if the committed fixtures are stale.
"""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from .models import AnalyzeRequest
from .modules.base import TaskNotCompleted
from .modules.eczema import EczemaPhotoModule
from .modules.finger_tapping import tap_metrics
from .modules.hand_tremor import tremor_metrics
from .synthetic import tremor_track
from .pipeline import run_prepared


def skin_photo(
    patch_frac=0.2, redness=40.0, base=(150, 170, 215), blur=False, size=(240, 320), seed=0, background_frac=0.0
) -> np.ndarray:
    """BGR skin-toned image with a redder rectangle, fine texture and optional non-skin margin."""
    rng = np.random.default_rng(seed)
    h, w = size
    img = np.zeros((h, w, 3), np.float32)
    img[:] = base
    ph, pw = int(np.sqrt(patch_frac) * h), int(np.sqrt(patch_frac) * w)
    y0, x0 = (h - ph) // 2, (w - pw) // 2
    img[y0 : y0 + ph, x0 : x0 + pw] += (-redness / 2, -redness, redness / 4)
    if background_frac:
        img[:, : int(background_frac * w)] = (190, 120, 70)  # blue-grey wall, outside the skin rule
    img += rng.normal(0, 12, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 10)
    return img


PHOTO_CASES: list[dict[str, Any]] = [
    {"name": "mild", "patch_frac": 0.15, "redness": 25},
    {"name": "moderate", "patch_frac": 0.25, "redness": 40},
    {"name": "severe", "patch_frac": 0.35, "redness": 60},
    {"name": "darker_tone", "patch_frac": 0.2, "redness": 35, "base": (80, 105, 150)},
    {"name": "blurry", "patch_frac": 0.2, "redness": 40, "blur": True},
    {"name": "odd_size", "patch_frac": 0.2, "redness": 40, "size": (181, 263), "seed": 3},
    {"name": "with_background", "patch_frac": 0.15, "redness": 45, "background_frac": 0.45, "seed": 7},
    {"name": "mostly_background", "patch_frac": 0.05, "redness": 30, "background_frac": 0.85, "seed": 9},
]


def tap_signal(rate_hz=3.0, seconds=10.0, fps=30.0, amp=1.0, decay=0.0, noise=0.0, gaps=0, seed=0) -> np.ndarray:
    t = np.arange(0, seconds, 1 / fps)
    envelope = amp * (1 - decay * t / seconds)
    rng = np.random.default_rng(seed)
    x = 0.1 + envelope * (0.5 - 0.5 * np.cos(2 * np.pi * rate_hz * t)) + rng.normal(0, noise, t.size)
    if gaps:
        x[::gaps] = np.nan
    return x


TAP_CASES: list[dict[str, Any]] = [
    {"name": "steady_3hz", "rate_hz": 3.0},
    {"name": "decrement", "rate_hz": 2.5, "decay": 0.5},
    {"name": "noisy_gaps", "rate_hz": 4.0, "noise": 0.03, "gaps": 7, "detection_rate": 0.85},
    {"name": "fps_24", "rate_hz": 2.0, "fps": 24.0, "noise": 0.02, "seed": 5},
    {"name": "flat", "rate_hz": 0.0, "amp": 0.0},
]


def photo_case(case: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    kw = {k: v for k, v in case.items() if k != "name"}
    bgr = skin_photo(**kw)
    m = EczemaPhotoModule()
    # the embedding feature group is checked separately (it is a TFLite model, not ported math)
    obs = run_prepared(m, m.prepare_array(bgr), AnalyzeRequest(module="eczema_photo"), embed=False)
    expected = {
        "accepted": obs.quality.accepted,
        "checks": {c.name: {"passed": c.passed, "value": c.value} for c in obs.quality.checks},
        "measurements": {x.name: {"value": x.value, "uncertainty": x.uncertainty} for x in obs.measurements},
        "features": obs.features,
    }
    return bgr, expected


def tap_case(case: dict[str, Any]) -> dict[str, Any]:
    kw = {k: v for k, v in case.items() if k not in ("name", "detection_rate")}
    fps = kw.get("fps", 30.0)
    signal = tap_signal(**kw)
    out: dict[str, Any] = {
        "fps": fps,
        "detection_rate": case.get("detection_rate", 1.0),
        "signal": [None if np.isnan(v) else round(float(v), 9) for v in signal],
    }
    try:
        m = tap_metrics(np.array([np.nan if v is None else v for v in out["signal"]], dtype=float), fps, out["detection_rate"])
        out["expected"] = {k: float(v) for k, v in m.__dict__.items()}
    except TaskNotCompleted as e:
        out["expected_error"] = str(e)
    return out


TREMOR_CASES: list[dict[str, Any]] = [
    {"name": "clean_5hz", "freq_hz": 5.0, "amplitude": 0.1, "seconds": 8.0},
    {"name": "finger_7hz_drift_gaps", "freq_hz": 7.0, "amplitude": 0.02, "finger_amplitude": 0.15, "drift": 0.1, "missing": 0.1, "fps": 24.0, "seconds": 9.0, "seed": 3},
    {"name": "still", "amplitude": 0.0, "seconds": 8.0, "seed": 4},
    {"name": "fps60_10hz", "freq_hz": 10.0, "amplitude": 0.05, "fps": 60.0, "seconds": 5.0, "seed": 5},
    {"name": "no_hand", "seconds": 3.0, "seed": 6, "no_hand": True},
]


def tremor_case(case: dict[str, Any]) -> dict[str, Any]:
    kw = {k: v for k, v in case.items() if k not in ("name", "no_hand")}
    track = tremor_track(**kw)
    lm = np.round(track.landmarks, 4)
    if case.get("no_hand"):
        lm[:] = np.nan
    out: dict[str, Any] = {
        "fps": track.fps,
        "landmarks": [[[None if np.isnan(v) else float(v) for v in pt] for pt in frame] for frame in lm],
    }
    try:
        m = tremor_metrics(lm, track.fps)
        out["expected"] = {k: float(v) for k, v in m.__dict__.items()}
    except TaskNotCompleted as e:
        out["expected_error"] = str(e)
    return out


def build_fixtures() -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    images: dict[str, np.ndarray] = {}
    photos = {}
    for case in PHOTO_CASES:
        bgr, expected = photo_case(case)
        images[f"{case['name']}.png"] = bgr
        photos[case["name"]] = {"file": f"{case['name']}.png", **expected}
    taps = {case["name"]: tap_case(case) for case in TAP_CASES}
    tremor = {case["name"]: tremor_case(case) for case in TREMOR_CASES}
    return images, {"photos": photos, "taps": taps, "tremor": tremor}
