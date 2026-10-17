"""Reusable quality checks. Each returns a QualityCheck whose message tells the patient
exactly what to change, so the agent can send it verbatim as a retry instruction."""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from .models import QualityCheck, QualityReport


def blur_check(gray: np.ndarray, min_sharpness: float) -> QualityCheck:
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    return QualityCheck(
        name="blur",
        passed=sharpness >= min_sharpness,
        value=round(sharpness, 1),
        threshold=min_sharpness,
        message="The picture is blurry. Rest your phone against something steady and tap the screen to focus first.",
    )


def exposure_check(gray: np.ndarray, lo: float, hi: float) -> QualityCheck:
    return exposure_value_check(float(gray.mean()), lo, hi)


def exposure_value_check(mean: float, lo: float, hi: float) -> QualityCheck:
    if mean < lo:
        msg = "It's too dark. Turn on a light or face a window (no flash)."
    else:
        msg = "It's too bright or washed out. Move out of direct sunlight and turn off the flash."
    return QualityCheck(
        name="exposure",
        passed=lo <= mean <= hi,
        value=round(mean, 1),
        threshold=lo if mean < lo else hi,
        message=msg,
    )


def fraction_check(name: str, fraction: float, min_fraction: float, message: str) -> QualityCheck:
    return QualityCheck(
        name=name,
        passed=fraction >= min_fraction,
        value=round(float(fraction), 3),
        threshold=min_fraction,
        message=message,
    )


def min_value_check(name: str, value: float, minimum: float, message: str) -> QualityCheck:
    return QualityCheck(
        name=name, passed=value >= minimum, value=round(float(value), 2), threshold=minimum, message=message
    )


# Hand videos are judged on the hand, not the whole frame: in a 1080p phone video most pixels are
# smooth wall or table and H.264 softens fine detail, so whole-frame sharpness rejected sharp,
# perfectly trackable videos (training/calibration/hand_video_sharpness.md). Each sampled frame
# is cropped to the hand's landmark box plus a margin and resized to a fixed size, so the value
# doesn't depend on resolution or on how close the hand is.
HAND_CROP_SIDE = 256
HAND_CROP_MARGIN = 0.25
SOFT_HAND_MESSAGE = (
    "Your hand looks a little soft or blurry. We kept this video; next time, prop the phone up and tap the screen on your hand to focus."
)


def hand_crop(gray: np.ndarray, pts: Optional[np.ndarray]) -> Optional[np.ndarray]:
    """The hand's landmark bounding box (+25% margin) from a grayscale frame, longest side 256 px."""
    if pts is None or np.isnan(pts[0, 0]):
        return None
    (x0, y0), (x1, y1) = pts.min(axis=0), pts.max(axis=0)
    m = HAND_CROP_MARGIN * max(x1 - x0, y1 - y0)
    h, w = gray.shape[:2]
    X0, Y0 = int(max(0, np.floor(x0 - m))), int(max(0, np.floor(y0 - m)))
    X1, Y1 = int(min(w, np.ceil(x1 + m))), int(min(h, np.ceil(y1 + m)))
    if X1 - X0 < 16 or Y1 - Y0 < 16:
        return None
    crop = gray[Y0:Y1, X0:X1]
    s = HAND_CROP_SIDE / max(crop.shape)
    size = (max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s)))
    return cv2.resize(crop, size, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)


def hand_video_checks(grays: list[np.ndarray], sample_landmarks: list[Optional[np.ndarray]], c: dict[str, float]) -> list[QualityCheck]:
    """Sharpness (advisory) and exposure (blocking) of the hand over the sampled frames, as medians.

    Sharpness is advisory: if MediaPipe tracks the hand and the measurement succeeds, a soft
    image doesn't make the capture unusable, and tremor itself blurs the hand. Low values are
    recorded and shown to clinicians. Landmark tracks (.npz) carry no frames: nothing to check.
    """
    if not grays:
        return []
    crops = [x for x in (hand_crop(g, p) for g, p in zip(grays, sample_landmarks)) if x is not None]
    if crops:
        sharpness = float(np.median([cv2.Laplacian(x, cv2.CV_64F).var() for x in crops]))
        brightness = float(np.median([x.mean() for x in crops]))
    else:  # no hand in the sampled frames (hand_visible will say so): judge the middle frame
        mid = grays[len(grays) // 2]
        sharpness = float(cv2.Laplacian(mid, cv2.CV_64F).var())
        brightness = float(mid.mean())
    return [
        QualityCheck(
            name="blur",
            passed=sharpness >= c["blur"],
            value=round(sharpness, 1),
            threshold=c["blur"],
            message=SOFT_HAND_MESSAGE,
            advisory=True,
        ),
        exposure_value_check(brightness, c["exposure_min"], c["exposure_max"]),
    ]


def build_report(checks: list[QualityCheck]) -> QualityReport:
    failed = [c for c in checks if not c.passed and not c.advisory]
    retry: Optional[str] = None
    if failed:
        retry = " ".join(c.message for c in failed) + " Then send it again 🙏"
    return QualityReport(accepted=not failed, checks=checks, retry_instructions=retry)
