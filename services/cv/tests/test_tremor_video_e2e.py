"""Hand tremor end to end with the real MediaPipe hand landmarker on synthesized videos."""
import pytest

pytest.importorskip("mediapipe")

from app.models import AnalyzeRequest  # noqa: E402
from app.modules.hands import hand_model_path  # noqa: E402
from app.pipeline import analyze  # noqa: E402
from tests.videos import write_tremor_video  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def model():
    try:
        hand_model_path()
    except OSError as e:  # offline CI
        pytest.skip(f"hand landmarker model unavailable: {e}")


HAND_SIZE_PX = 0.2844 * 360  # wrist to middle knuckle in the 360 px fixture, as MediaPipe sees it


def value(obs, name):
    return next(m.value for m in obs.measurements if m.name == name)


@pytest.mark.parametrize("freq", [4.0, 6.0, 9.0])
def test_real_landmarks_recover_tremor_frequency(tmp_path, freq):
    obs = analyze(AnalyzeRequest(module="hand_tremor"), str(write_tremor_video(tmp_path / "t.mp4", freq_hz=freq, amplitude_px=14, seed=int(freq))))
    assert obs.quality.accepted, [c for c in obs.quality.checks if not c.passed]
    assert value(obs, "tremor_freq_hz") == pytest.approx(freq, abs=0.5)
    assert value(obs, "tremor_power_ratio") > 0.5
    assert value(obs, "tremor_amplitude") == pytest.approx(14 / HAND_SIZE_PX, rel=0.1)


def test_larger_shake_measures_larger(tmp_path):
    small = analyze(AnalyzeRequest(module="hand_tremor"), str(write_tremor_video(tmp_path / "s.mp4", amplitude_px=6, seed=1)))
    large = analyze(AnalyzeRequest(module="hand_tremor"), str(write_tremor_video(tmp_path / "l.mp4", amplitude_px=24, seed=1)))
    assert value(large, "tremor_amplitude") > 2.5 * value(small, "tremor_amplitude")


def test_still_hand_has_little_tremor(tmp_path):
    still = analyze(AnalyzeRequest(module="hand_tremor"), str(write_tremor_video(tmp_path / "z.mp4", amplitude_px=0, seed=2)))
    shaky = analyze(AnalyzeRequest(module="hand_tremor"), str(write_tremor_video(tmp_path / "y.mp4", amplitude_px=14, seed=2)))
    assert still.quality.accepted
    assert value(still, "tremor_amplitude") < value(shaky, "tremor_amplitude") / 4
