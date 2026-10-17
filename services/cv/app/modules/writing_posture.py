"""Index-finger straightening during a fixed-side-view pen hold and writing task."""
from __future__ import annotations

from .. import quality as q
from ..models import QualityCheck
from ..registry import register
from .base import CVModule, MeasureResult, MeasurementSpec, TaskNotCompleted
from .hands import HandTrack, HandTracker, load_hand_media
from .writing_posture_core import evaluate_track


@register
class WritingPostureModule(CVModule):
    id = "writing_posture"
    version = "0.1.0"
    label = "Writing posture: index-finger straightening"
    media_type = "video"
    conditions = ["focal_hand_dystonia"]
    components = ["blur", "exposure", "duration", "hand_visible", "hand_landmarks", "index_joint_angle"]
    measurements = [
        MeasurementSpec("index_straight_fraction", "Index finger straight during writing", "fraction"),
        MeasurementSpec("index_pip_angle_deg", "Mean index PIP angle during writing", "degrees"),
    ]
    feature_names = ["index_straight_fraction", "index_pip_angle_deg", "hold_index_pip_angle_deg", "posture_change_deg",
                     "example_frame_s", "index_visible_fraction", "duration_s"]
    default_criteria = {"blur": 20, "exposure_min": 60, "exposure_max": 220,
                        "hand_visible": 0.8, "index_visible": 0.7, "duration_s": 6,
                        "fps": 20, "hold_s": 2, "straight_deg": 160}

    def __init__(self, tracker_factory=HandTracker) -> None:
        self._tracker_factory = tracker_factory

    def prepare(self, path: str, start_s: float = 0.0) -> HandTrack:
        return load_hand_media(path, self._tracker_factory, start_s)

    def _result(self, track: HandTrack, c: dict[str, float]) -> dict:
        return evaluate_track(track.landmarks.tolist(), track.fps, hold_s=c["hold_s"],
                              straight_deg=c["straight_deg"], min_visible=c["index_visible"],
                              min_duration_s=c["duration_s"])

    def quality_checks(self, t: HandTrack, c: dict[str, float]) -> list[QualityCheck]:
        result = self._result(t, c)
        return q.hand_video_checks(t.gray_samples, t.sample_landmarks, c) + [
            q.min_value_check("duration_s", t.duration_s, c["duration_s"],
                              "Record at least six seconds: hold the pen still, then write the same short phrase."),
            q.min_value_check("fps", t.fps, c["fps"], "Use normal video mode at 30 fps."),
            q.fraction_check("hand_visible", t.detection_rate, c["hand_visible"],
                             "Keep your hand and wrist in view from the side."),
            q.fraction_check("index_visible", result["visible_fraction"], c["index_visible"],
                             "Keep your index finger visible while writing; move the camera to a clear side view."),
            q.fraction_check("index_hold_visible", result["hold_visible_fraction"], c["index_visible"],
                             "Keep your index finger visible during the two-second pen hold."),
            QualityCheck(name="hold_and_writing", passed=result["reason"] != "incomplete_hold_or_writing",
                         value=None, threshold=None,
                         message="Hold the pen for two seconds, then write the short phrase with your index finger visible."),
        ]

    def measure(self, t: HandTrack, c: dict[str, float]) -> MeasureResult:
        result = self._result(t, c)
        if not result["accepted"]:
            raise TaskNotCompleted("Keep the index finger visible during both pen hold and writing.")
        features = {
            "index_straight_fraction": result["straight_fraction"],
            "index_pip_angle_deg": result["writing_angle_deg"],
            "hold_index_pip_angle_deg": result["hold_angle_deg"],
            "posture_change_deg": result["writing_angle_deg"] - result["hold_angle_deg"],
            "example_frame_s": result["example_frame_s"],
            "index_visible_fraction": result["visible_fraction"],
            "duration_s": result["duration_s"],
        }
        return MeasureResult(
            measurements=[self.measurement("index_straight_fraction", result["straight_fraction"], None),
                          self.measurement("index_pip_angle_deg", result["writing_angle_deg"], None)],
            features=features,
        )
