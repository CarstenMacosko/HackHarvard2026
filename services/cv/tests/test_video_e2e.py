"""End-to-end finger tapping with the real MediaPipe hand landmarker on a synthetic video."""
import pytest

pytest.importorskip("mediapipe")

from app.models import AnalyzeRequest  # noqa: E402
from app.modules.finger_tapping import hand_model_path  # noqa: E402
from app.pipeline import analyze  # noqa: E402
from tests.videos import write_phone_tapping_video, write_tapping_video  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def model():
    try:
        hand_model_path()
    except OSError as e:  # offline CI
        pytest.skip(f"hand landmarker model unavailable: {e}")


def run(path):
    return analyze(AnalyzeRequest(module="finger_tapping"), str(path))


def measurement(obs, name):
    return next(m for m in obs.measurements if m.name == name)


def test_real_landmarks_recover_tap_rate(tmp_path):
    obs = run(write_tapping_video(tmp_path / "tap.mp4", rate_hz=2.5))
    assert obs.quality.accepted, [c for c in obs.quality.checks if not c.passed]
    assert measurement(obs, "tap_rate_hz").value == pytest.approx(2.5, abs=0.15)
    assert measurement(obs, "amplitude_norm").value > 0.5
    assert obs.features["detection_rate"] > 0.9
    assert set(obs.features) >= {"tap_rate_hz", "n_taps", "rate_first_half", "duration_s"}


def test_dark_video_fails_exposure(tmp_path):
    obs = run(write_tapping_video(tmp_path / "dark.mp4", brightness=0.25))
    assert not obs.quality.accepted
    assert any(c.name == "exposure" and not c.passed for c in obs.quality.checks)


def test_hand_missing_for_half_the_video(tmp_path):
    obs = run(write_tapping_video(tmp_path / "late.mp4", hand_visible_from=5.0))
    failed = {c.name for c in obs.quality.checks if not c.passed}
    assert "hand_visible" in failed


needs_x264 = pytest.mark.skipif(
    __import__("shutil").which("ffmpeg") is None, reason="ffmpeg (libx264) not installed"
)


@needs_x264
def test_sharp_phone_video_is_accepted_without_flags(tmp_path):
    """The case the team hit: 1080p H.264, hand on a smooth wall. Whole-frame sharpness was ~110 at
    best and the old gate (≥ 60) rejected real phone clips; the hand region scores far higher."""
    obs = run(write_phone_tapping_video(tmp_path / "phone.mp4"))
    assert obs.quality.accepted, obs.quality.checks
    blur = next(c for c in obs.quality.checks if c.name == "blur")
    assert blur.passed and blur.advisory
    assert measurement(obs, "tap_rate_hz").value == pytest.approx(2.5, abs=0.15)


@needs_x264
def test_defocused_phone_video_is_accepted_and_flagged(tmp_path):
    obs = run(write_phone_tapping_video(tmp_path / "soft.mp4", defocus=4))
    assert obs.quality.accepted, obs.quality.checks
    blur = next(c for c in obs.quality.checks if c.name == "blur")
    assert not blur.passed and blur.advisory  # flagged for the clinician, not rejected
    assert measurement(obs, "tap_rate_hz").value == pytest.approx(2.5, abs=0.15)


def test_trim_start_skips_the_framing_segment(tmp_path):
    """Live capture keeps a few seconds of framing before the first tap; trim_start_s skips it."""
    path = write_tapping_video(tmp_path / "live.mp4", seconds=14.4, hand_visible_from=4.0)
    untrimmed = run(path)
    assert "hand_visible" in {c.name for c in untrimmed.quality.checks if not c.passed}
    obs = analyze(AnalyzeRequest(module="finger_tapping", trim_start_s=4.0), str(path))
    assert obs.quality.accepted, [c for c in obs.quality.checks if not c.passed]
    assert measurement(obs, "tap_rate_hz").value == pytest.approx(2.5, abs=0.15)
