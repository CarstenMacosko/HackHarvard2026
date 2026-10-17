import numpy as np

from app.models import AnalyzeRequest
from app.modules.hands import HandTrack
from app.modules.writing_posture import WritingPostureModule
from app.modules.writing_posture_core import evaluate_track
from app.pipeline import run_prepared
from scripts.visit_report import build_report
from scripts.export_landmark_case import export_case


def track(straight=True, occluded=False):
    lm = np.zeros((240, 21, 2), dtype=float)
    lm[:, 0] = [0, -15]
    lm[:, 5] = [0, 0]
    lm[:, 6] = [0, 10]
    lm[:, 7] = [0, 20] if straight else [10, 10]
    lm[:, 9] = [0, 5]
    if occluded:
        lm[90:, 6] = np.nan
    return HandTrack(fps=30, landmarks=lm)


def test_straight_and_bent_index_angle():
    straight = evaluate_track(track(True).landmarks.tolist(), 30)
    bent = evaluate_track(track(False).landmarks.tolist(), 30)
    assert straight["accepted"] and straight["straight_fraction"] == 1
    assert bent["accepted"] and bent["straight_fraction"] == 0
    assert straight["writing_angle_deg"] == 180
    assert bent["writing_angle_deg"] == 90


def test_module_emits_features_and_supporting_timestamp():
    obs = run_prepared(WritingPostureModule(), track(), AnalyzeRequest(module="writing_posture"))
    assert obs.quality.accepted
    assert obs.model_version == "writing_posture@0.1.0"
    assert obs.features["index_straight_fraction"] == 1
    assert 2 <= obs.features["example_frame_s"] <= 8
    assert all(m.validation_status == "reusable_needs_validation" for m in obs.measurements)


def test_obscured_finger_is_quality_failure():
    obs = run_prepared(WritingPostureModule(), track(occluded=True), AnalyzeRequest(module="writing_posture"))
    assert not obs.quality.accepted
    assert obs.measurements == []
    assert any(c.name == "index_visible" and not c.passed for c in obs.quality.checks)


def test_visit_report_links_observation_and_missing_tasks(tmp_path):
    media = tmp_path / "writing.npz"
    np.savez_compressed(media, fps=30, landmarks=track().landmarks)
    report = build_report("visit-7", "participant-2", "study-1", {"writing_posture": str(media)})
    assert report["visit_id"] == "visit-7"
    assert [r["module"] for r in report["tasks"]] == ["finger_tapping", "hand_tremor", "writing_posture"]
    assert [r["missing_reason"] for r in report["tasks"]] == ["capture_not_supplied", "capture_not_supplied", None]
    observation = report["tasks"][2]["observation"]
    assert observation["context"]["visit_id"] == "visit-7"
    assert observation["model_version"] == "writing_posture@0.1.0"
    assert observation["quality"]["accepted"]
    exported = export_case(str(media), "writing-1")
    assert exported["id"] == "writing-1"
    assert exported["fps"] == 30
    assert len(exported["frames"]) == 240
