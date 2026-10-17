import numpy as np
import pytest

pytest.importorskip("mediapipe")

from app import embedding  # noqa: E402
from app.models import AnalyzeRequest  # noqa: E402
from app.modules.eczema import EczemaPhotoModule  # noqa: E402
from app.parity import skin_photo  # noqa: E402
from app.pipeline import run_prepared  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def model():
    try:
        embedding.embedder_model_path()
    except OSError as e:
        pytest.skip(f"embedder model unavailable: {e}")


def test_embedding_is_unit_length_and_deterministic():
    img = skin_photo(seed=1)
    a = embedding.embed_bgr(img)
    assert list(a) == embedding.FEATURE_NAMES
    v = np.array(list(a.values()))
    assert np.linalg.norm(v) == pytest.approx(1.0, abs=1e-4)
    assert embedding.embed_bgr(img) == a


def test_accepted_photos_carry_embedding_features():
    m = EczemaPhotoModule()
    obs = run_prepared(m, m.prepare_array(skin_photo(patch_frac=0.25, redness=40)), AnalyzeRequest(module="eczema_photo"))
    assert obs.quality.accepted
    assert set(EczemaPhotoModule.feature_names) <= set(obs.features)
    assert sum(k.startswith("mnv3s_") for k in obs.features) == embedding.DIM


def test_rejected_photos_do_not():
    m = EczemaPhotoModule()
    obs = run_prepared(m, m.prepare_array(skin_photo(blur=True)), AnalyzeRequest(module="eczema_photo"))
    assert not obs.quality.accepted
    assert obs.features == {}
