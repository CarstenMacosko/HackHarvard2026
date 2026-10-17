import numpy as np
import pytest

from app.modules.base import TaskNotCompleted
from app.modules.finger_tapping import FingerTappingModule, PreparedVideo, tap_metrics
from app.models import AnalyzeRequest
from app.pipeline import run_prepared


def synthetic_taps(rate_hz=3.0, seconds=10.0, fps=30.0, amp=1.0, decay=0.0, noise=0.0, seed=0):
    t = np.arange(0, seconds, 1 / fps)
    envelope = amp * (1 - decay * t / seconds)
    rng = np.random.default_rng(seed)
    return 0.1 + envelope * (0.5 - 0.5 * np.cos(2 * np.pi * rate_hz * t)) + rng.normal(0, noise, t.size)


def test_recovers_tap_rate_and_amplitude():
    m = tap_metrics(synthetic_taps(rate_hz=3.0, amp=1.0), fps=30)
    assert m.tap_rate_hz == pytest.approx(3.0, abs=0.1)
    assert m.amplitude == pytest.approx(1.0, abs=0.1)
    assert abs(m.decrement_pct) < 5
    assert m.rhythm_cv < 0.05


def test_detects_decrement():
    m = tap_metrics(synthetic_taps(rate_hz=2.5, decay=0.5), fps=30)
    assert m.decrement_pct > 25


def test_tolerates_missing_frames_and_noise():
    sig = synthetic_taps(rate_hz=4.0, noise=0.03)
    sig[::7] = np.nan
    m = tap_metrics(sig, fps=30, detection_rate=0.85)
    assert m.tap_rate_hz == pytest.approx(4.0, abs=0.2)


def test_no_taps_is_task_not_completed():
    with pytest.raises(TaskNotCompleted):
        tap_metrics(np.full(300, 0.4), fps=30)


def _prepared(distance, gray_value=120, sharp=True, fps=30.0):
    rng = np.random.default_rng(1)
    gray = np.full((240, 320), gray_value, np.uint8)
    if sharp:
        gray = np.clip(gray + rng.integers(-40, 40, gray.shape), 0, 255).astype(np.uint8)
    det = float((~np.isnan(distance)).mean())
    return PreparedVideo(fps=fps, duration_s=len(distance) / fps, gray_samples=[gray] * 10, distance=distance, detection_rate=det)


def test_pipeline_accepts_good_capture():
    obs = run_prepared(FingerTappingModule(), _prepared(synthetic_taps()), AnalyzeRequest(module="finger_tapping"))
    assert obs.quality.accepted
    names = [m.name for m in obs.measurements]
    assert names == ["tap_rate_hz", "amplitude_norm", "amplitude_decrement", "rhythm_cv"]
    assert obs.model_version == f"finger_tapping@{FingerTappingModule.version}"
    assert obs.features["n_taps"] >= 4


def test_pipeline_rejects_blurry_dark_capture_with_instructions():
    obs = run_prepared(
        FingerTappingModule(), _prepared(synthetic_taps(), gray_value=30, sharp=False), AnalyzeRequest(module="finger_tapping")
    )
    assert not obs.quality.accepted
    failed = {c.name for c in obs.quality.checks if not c.passed}
    assert {"blur", "exposure"} <= failed
    assert "blurry" in obs.quality.retry_instructions and "dark" in obs.quality.retry_instructions
    assert obs.measurements == []


def test_pipeline_rejects_hand_out_of_frame():
    sig = synthetic_taps()
    sig[: len(sig) // 2] = np.nan
    obs = run_prepared(FingerTappingModule(), _prepared(sig), AnalyzeRequest(module="finger_tapping"))
    assert [c.name for c in obs.quality.checks if not c.passed] == ["hand_visible"]
