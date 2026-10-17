import cv2
import numpy as np

from app.models import AnalyzeRequest
from app.modules.eczema import EczemaPhotoModule
from app.pipeline import run_prepared


def skin_photo(patch_frac=0.2, redness=40, blur=False, seed=0):
    """Synthetic skin-toned image with a redder square patch and fine texture."""
    rng = np.random.default_rng(seed)
    h, w = 400, 400
    img = np.zeros((h, w, 3), np.float32)
    img[:] = (150, 170, 215)  # BGR light skin tone
    side = int(np.sqrt(patch_frac) * h)
    y0 = (h - side) // 2
    img[y0 : y0 + side, y0 : y0 + side] += (-redness / 2, -redness, redness / 4)
    img += rng.normal(0, 12, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)
    if blur:
        img = cv2.GaussianBlur(img, (31, 31), 10)
    return img


def run(img):
    m = EczemaPhotoModule()
    return run_prepared(m, m.prepare_array(img), AnalyzeRequest(module="eczema_photo"))


def test_measures_affected_area():
    obs = run(skin_photo(patch_frac=0.2))
    assert obs.quality.accepted, obs.quality
    area = next(x for x in obs.measurements if x.name == "affected_area_pct")
    assert 12 < area.value < 30
    assert area.uncertainty is not None


def test_redder_patch_scores_higher():
    mild = next(x for x in run(skin_photo(redness=25)).measurements if x.name == "erythema_index")
    severe = next(x for x in run(skin_photo(redness=60)).measurements if x.name == "erythema_index")
    assert severe.value > mild.value


def test_blurry_photo_fails_quality():
    obs = run(skin_photo(blur=True))
    assert not obs.quality.accepted
    assert any(c.name == "blur" and not c.passed for c in obs.quality.checks)


def test_no_skin_fails_coverage():
    img = np.random.default_rng(0).integers(0, 255, (300, 300, 3), dtype=np.uint8)
    img[..., 2] = 20  # blue/green noise, nothing skin-like
    obs = run(img)
    assert any(c.name == "skin_coverage" and not c.passed for c in obs.quality.checks)
