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
    mean = float(gray.mean())
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


def worst_frames(grays: list[np.ndarray], k: int = 3) -> list[np.ndarray]:
    """For video, judge sharpness on the median of a few sampled frames rather than one frame."""
    if len(grays) <= k:
        return grays
    idx = np.linspace(0, len(grays) - 1, k).astype(int)
    return [grays[i] for i in idx]


def build_report(checks: list[QualityCheck]) -> QualityReport:
    failed = [c for c in checks if not c.passed]
    retry: Optional[str] = None
    if failed:
        retry = " ".join(c.message for c in failed) + " Then send it again 🙏"
    return QualityReport(accepted=not failed, checks=checks, retry_instructions=retry)
