"""Atopic dermatitis photo module: visible redness and affected area within skin.

Erythema is measured as CIELAB a* relative to the participant's own unaffected skin in the
same photo (25th percentile of a* over the skin mask), which cancels much of the lighting and
skin-tone variation between captures. This is a transparent baseline, not a validated EASI score.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .. import quality as q
from ..models import Measurement, QualityCheck
from ..registry import register
from .base import CVModule, MeasurementSpec, TaskNotCompleted

AFFECTED_DELTA_A = 8.0  # a* units above reference skin counted as affected
DELTA_SENSITIVITY = 2.0  # ± threshold used to express area uncertainty


# ---------- pure image math ----------


def skin_mask(bgr: np.ndarray) -> np.ndarray:
    """Broad YCrCb skin rule, with the Cr ceiling raised so inflamed (red) skin stays in the
    mask. Adroit-trained segmentation can replace this later."""
    smooth = cv2.GaussianBlur(bgr, (5, 5), 0)  # sensor noise otherwise speckles the mask
    ycrcb = cv2.cvtColor(smooth, cv2.COLOR_BGR2YCrCb)
    mask = cv2.inRange(ycrcb, (0, 133, 77), (255, 205, 135))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask > 0


def redness_metrics(bgr: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    # judge redness per region, not per pixel: sensor noise alone spans several a* units
    smooth = cv2.GaussianBlur(bgr, (9, 9), 0)
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
    a = lab[..., 1] - 128.0
    skin_a = a[mask]
    if skin_a.size < 500:
        raise TaskNotCompleted("I couldn't find enough skin in the photo. Move closer so the patch fills most of the frame.")
    ref = float(np.percentile(skin_a, 25))

    def area(delta: float) -> float:
        return float((skin_a > ref + delta).mean() * 100)

    affected = skin_a[skin_a > ref + AFFECTED_DELTA_A]
    erythema = float(affected.mean() - ref) if affected.size else 0.0
    area_pct = area(AFFECTED_DELTA_A)
    area_unc = abs(area(AFFECTED_DELTA_A - DELTA_SENSITIVITY) - area(AFFECTED_DELTA_A + DELTA_SENSITIVITY)) / 2
    erythema_unc = float(affected.std() / np.sqrt(affected.size)) if affected.size > 1 else 0.0
    return {
        "erythema_index": erythema,
        "erythema_unc": erythema_unc,
        "affected_area_pct": area_pct,
        "area_unc": area_unc,
        "reference_a": ref,
    }


# ---------- module ----------


@dataclass
class PreparedPhoto:
    bgr: np.ndarray
    gray: np.ndarray
    mask: np.ndarray


def load_photo(path: str, max_side: int = 1024) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise TaskNotCompleted("I couldn't open that photo. Please take it again.")
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


@register
class EczemaPhotoModule(CVModule):
    id = "eczema_photo"
    version = "0.1.0"
    label = "Skin photo (atopic dermatitis)"
    media_type = "photo"
    conditions = ["eczema"]
    components = ["blur", "exposure", "skin_coverage", "skin_mask", "erythema_index", "lesion_area"]
    measurements = [
        MeasurementSpec("erythema_index", "Erythema index", "Δa*"),
        MeasurementSpec("affected_area_pct", "Affected area", "% of skin"),
    ]
    default_criteria = {"blur": 80, "exposure_min": 70, "exposure_max": 210, "skin_coverage": 0.25}

    def prepare(self, path: str) -> PreparedPhoto:
        return self.prepare_array(load_photo(path))

    def prepare_array(self, bgr: np.ndarray) -> PreparedPhoto:
        return PreparedPhoto(bgr=bgr, gray=cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), mask=skin_mask(bgr))

    def quality_checks(self, p: PreparedPhoto, c: dict[str, float]) -> list[QualityCheck]:
        return [
            q.blur_check(p.gray, c["blur"]),
            q.exposure_check(p.gray, c["exposure_min"], c["exposure_max"]),
            q.fraction_check(
                "skin_coverage",
                float(p.mask.mean()),
                c["skin_coverage"],
                "The skin patch is too small in the photo. Hold your phone about one forearm's length away so the area fills most of the frame.",
            ),
        ]

    def measure(self, p: PreparedPhoto, c: dict[str, float]) -> list[Measurement]:
        m = redness_metrics(p.bgr, p.mask)
        return [
            self.measurement("erythema_index", m["erythema_index"], m["erythema_unc"]),
            self.measurement("affected_area_pct", m["affected_area_pct"], m["area_unc"]),
        ]
