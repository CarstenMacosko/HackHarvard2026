"""Atopic dermatitis photo module: visible redness and affected area within skin.

Erythema is measured as CIELAB a* relative to the participant's own unaffected skin in the
same photo (25th percentile of a* over the skin mask), which cancels much of the lighting and
skin-tone variation between captures. This is a transparent baseline, not a validated EASI score.

The same algorithm runs on-device in the browser (packages/cv/src/eczema.ts); parity is
checked against fixtures exported by tests/test_parity_export.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted

AFFECTED_DELTA_A = 8.0  # a* units above reference skin counted as affected
DELTA_SENSITIVITY = 2.0  # ± threshold used to express area uncertainty
MIN_SKIN_PIXELS = 500
A_BIN_EDGES = (0.0, 4.0, 8.0, 12.0, 16.0)
FEATURE_NAMES = [
    "erythema_index",
    "affected_area_pct",
    "skin_coverage",
    "skin_l_mean",
    "skin_a_mean",
    "skin_b_mean",
    "skin_a_std",
    "a_ref",
    "a_p90_delta",
    "texture_laplacian_var",
    "a_bin_neg",
    "a_bin_0_4",
    "a_bin_4_8",
    "a_bin_8_12",
    "a_bin_12_16",
    "a_bin_16_plus",
]


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


def photo_features(bgr: np.ndarray, gray: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """Redness, extent, colour and texture statistics over the skin mask."""
    # judge redness per region, not per pixel: sensor noise alone spans several a* units
    smooth = cv2.GaussianBlur(bgr, (9, 9), 0)
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float64)
    skin_a = lab[..., 1][mask] - 128.0
    if skin_a.size < MIN_SKIN_PIXELS:
        raise TaskNotCompleted("I couldn't find enough skin in the photo. Move closer so the patch fills most of the frame.")
    ref = float(np.percentile(skin_a, 25))
    delta = skin_a - ref

    def area(d: float) -> float:
        return float((delta > d).mean() * 100)

    affected = skin_a[delta > AFFECTED_DELTA_A]
    lap = cv2.Laplacian(gray, cv2.CV_64F)[mask]
    # fraction of skin in each a*-above-reference band: (-inf,0), [0,4), [4,8), [8,12), [12,16), [16,inf)
    bins = np.bincount(np.searchsorted(A_BIN_EDGES, delta, side="right"), minlength=len(A_BIN_EDGES) + 1) / delta.size
    return {
        "erythema_index": float(affected.mean() - ref) if affected.size else 0.0,
        "affected_area_pct": area(AFFECTED_DELTA_A),
        "skin_coverage": float(mask.mean()),
        "skin_l_mean": float(lab[..., 0][mask].mean() * 100 / 255),
        "skin_a_mean": float(skin_a.mean()),
        "skin_b_mean": float(lab[..., 2][mask].mean() - 128.0),
        "skin_a_std": float(skin_a.std()),
        "a_ref": ref,
        "a_p90_delta": float(np.percentile(delta, 90)),
        "texture_laplacian_var": float(lap.var()),
        "a_bin_neg": float(bins[0]),
        "a_bin_0_4": float(bins[1]),
        "a_bin_4_8": float(bins[2]),
        "a_bin_8_12": float(bins[3]),
        "a_bin_12_16": float(bins[4]),
        "a_bin_16_plus": float(bins[5]),
        # uncertainty terms, used by measure() and not part of the public feature vector
        "_erythema_unc": float(affected.std() / np.sqrt(affected.size)) if affected.size > 1 else 0.0,
        "_area_unc": abs(area(AFFECTED_DELTA_A - DELTA_SENSITIVITY) - area(AFFECTED_DELTA_A + DELTA_SENSITIVITY)) / 2,
    }


def redness_metrics(bgr: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """Back-compatible summary used by older callers and tests."""
    f = photo_features(bgr, cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), mask)
    return {
        "erythema_index": f["erythema_index"],
        "erythema_unc": f["_erythema_unc"],
        "affected_area_pct": f["affected_area_pct"],
        "area_unc": f["_area_unc"],
        "reference_a": f["a_ref"],
    }


# ---------- module ----------


@dataclass
class PreparedPhoto:
    bgr: np.ndarray
    gray: np.ndarray
    mask: np.ndarray
    cache: dict = field(default_factory=dict)


def load_photo(path: str, max_side: int = 1024) -> np.ndarray:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise TaskNotCompleted("I couldn't open that photo. Please take it again.")
    return fit_max_side(img, max_side)


def fit_max_side(img: np.ndarray, max_side: int = 1024) -> np.ndarray:
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return img


@register
class EczemaPhotoModule(CVModule):
    id = "eczema_photo"
    version = "0.2.0"
    label = "Skin photo (atopic dermatitis)"
    media_type = "photo"
    conditions = ["eczema"]
    components = ["blur", "exposure", "skin_coverage", "skin_mask", "erythema_index", "lesion_area", "color_texture_features"]
    measurements = [
        MeasurementSpec("erythema_index", "Erythema index", "Δa*"),
        MeasurementSpec("affected_area_pct", "Affected area", "% of skin"),
    ]
    feature_names = FEATURE_NAMES
    # blur 15: calibrated on SCIN (training/calibration/eczema_photo_scin.md). Skin is smooth, so
    # sharp skin photos have low Laplacian variance; 15 keeps 83% of dermatologist-gradable photos
    # (the earlier 80 kept 33%) evenly across Fitzpatrick types.
    default_criteria = {"blur": 15, "exposure_min": 70, "exposure_max": 210, "skin_coverage": 0.25}

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

    def measure(self, p: PreparedPhoto, c: dict[str, float]) -> MeasureResult:
        f = photo_features(p.bgr, p.gray, p.mask)
        return MeasureResult(
            measurements=[
                self.measurement("erythema_index", f["erythema_index"], f["_erythema_unc"]),
                self.measurement("affected_area_pct", f["affected_area_pct"], f["_area_unc"]),
            ],
            features={k: f[k] for k in FEATURE_NAMES},
        )
