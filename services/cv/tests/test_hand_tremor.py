import numpy as np
import pytest

from app.models import AnalyzeRequest
from app.modules.base import TaskNotCompleted
from app.modules.hand_tremor import HandTremorModule, PreparedTremor, tremor_metrics
from app.modules.hands import load_track, save_track
from app.pipeline import analyze, run_prepared
from app.synthetic import tremor_track


@pytest.mark.parametrize("freq", [3.5, 4.0, 6.0, 9.0, 11.5])
def test_recovers_frequency_and_amplitude(freq):
    t = tremor_track(freq_hz=freq, amplitude=0.12, seed=int(freq * 10))
    m = tremor_metrics(t.landmarks, t.fps)
    assert m.freq_hz == pytest.approx(freq, abs=0.1)
    assert m.amplitude == pytest.approx(0.12, rel=0.1)
    assert m.power_ratio > 0.9
    assert m.peak_prominence > 2


def test_still_hand_has_no_tremor_peak():
    t = tremor_track(amplitude=0.0, seed=4)
    m = tremor_metrics(t.landmarks, t.fps)
    assert m.amplitude < 0.01
    assert m.peak_prominence < 1.0


def test_finger_only_tremor_shows_in_finger_amplitude():
    t = tremor_track(freq_hz=5.0, amplitude=0.0, finger_amplitude=0.2, seed=5)
    m = tremor_metrics(t.landmarks, t.fps)
    assert m.finger_amplitude == pytest.approx(0.2, rel=0.1)
    assert m.amplitude < m.finger_amplitude / 5
    assert m.freq_hz == pytest.approx(5.0, abs=0.1)


def test_tolerates_drift_and_missing_frames():
    t = tremor_track(freq_hz=5.0, amplitude=0.1, drift=0.2, missing=0.1, seed=6)
    m = tremor_metrics(t.landmarks, t.fps)
    assert m.freq_hz == pytest.approx(5.0, abs=0.15)
    assert m.amplitude == pytest.approx(0.1, rel=0.15)
    assert m.low_freq_motion > 0.1  # the wander is reported separately


def test_amplitude_is_independent_of_camera_distance():
    near = tremor_metrics(tremor_track(amplitude=0.1, scale_px=250, seed=7).landmarks, 30)
    far = tremor_metrics(tremor_track(amplitude=0.1, scale_px=80, seed=7).landmarks, 30)
    assert near.amplitude == pytest.approx(far.amplitude, rel=0.05)


def test_hand_never_seen_is_task_not_completed():
    lm = np.full((300, 21, 2), np.nan)
    with pytest.raises(TaskNotCompleted):
        tremor_metrics(lm, 30)


def test_landmark_track_file_runs_through_the_pipeline(tmp_path):
    path = tmp_path / "track.npz"
    save_track(path, tremor_track(freq_hz=6.0, amplitude=0.08, seed=8))
    assert load_track(path).landmarks.shape == (360, 21, 2)
    obs = analyze(AnalyzeRequest(module="hand_tremor"), str(path))
    assert obs.quality.accepted, obs.quality.checks
    assert {c.name for c in obs.quality.checks} == {"duration_s", "fps", "hand_visible"}  # no frames → no image checks
    freq = next(m for m in obs.measurements if m.name == "tremor_freq_hz")
    assert freq.value == pytest.approx(6.0, abs=0.1)
    assert set(obs.features) == set(HandTremorModule.feature_names)


def test_low_frame_rate_and_short_capture_fail_quality():
    t = tremor_track(seconds=5, fps=15, seed=9)
    obs = run_prepared(HandTremorModule(), PreparedTremor(track=t), AnalyzeRequest(module="hand_tremor"))
    failed = {c.name for c in obs.quality.checks if not c.passed}
    assert failed == {"duration_s", "fps"}
    assert obs.measurements == []
