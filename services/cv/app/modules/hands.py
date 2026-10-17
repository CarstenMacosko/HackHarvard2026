"""Hand tracking shared by the hand-based video modules (finger tapping, hand tremor).

A video becomes a `HandTrack`: 21 MediaPipe hand landmarks per frame in pixels (NaN where no
hand was found) plus a few grayscale frames for the image-quality checks.

Tracks can also be loaded from `.npz` files with the same fields. Datasets that share
landmark tracks instead of identifiable video, and the training kit's synthetic data, use
this path; such tracks carry no frames, so the image checks (blur, exposure) are skipped.
"""
from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .base import TaskNotCompleted

WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_MCP = 0, 4, 8, 9
N_LANDMARKS = 21
MAX_SECONDS = 30.0
GRAY_SAMPLES = 10
HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"


def hand_model_path() -> str:
    """MediaPipe hand landmarker model; downloaded once into services/cv/models/ if missing."""
    path = Path(os.environ.get("HAND_LANDMARKER_MODEL") or Path(__file__).resolve().parents[2] / "models" / "hand_landmarker.task")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(HAND_MODEL_URL, tmp)
        tmp.replace(path)
    return str(path)


class HandTracker:
    """Wraps MediaPipe's HandLandmarker (Tasks API, VIDEO mode)."""

    def __init__(self) -> None:
        import mediapipe as mp  # heavy optional dependency, see requirements-mediapipe.txt
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        self._lm = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=hand_model_path()),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )

    def __enter__(self) -> "HandTracker":
        return self

    def __exit__(self, *exc) -> None:
        self._lm.close()

    def landmarks(self, rgb: np.ndarray, timestamp_ms: int) -> tuple[np.ndarray | None, str | None]:
        """(21, 2) landmark positions in pixels, or None if no hand is visible."""
        mp = self._mp
        res = self._lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)), timestamp_ms)
        if not res.hand_landmarks:
            return None, None
        h, w = rgb.shape[:2]
        pts = np.array([[p.x * w, p.y * h] for p in res.hand_landmarks[0]], dtype=float)
        label = res.handedness[0][0].category_name if res.handedness else None
        return pts, label


@dataclass
class HandTrack:
    fps: float
    landmarks: np.ndarray  # (frames, 21, 2) pixels, NaN where no hand was detected
    gray_samples: list[np.ndarray] = field(default_factory=list)
    sample_landmarks: list[np.ndarray | None] = field(default_factory=list)  # landmarks of each gray sample
    hand_label: str | None = None

    @property
    def duration_s(self) -> float:
        return len(self.landmarks) / self.fps

    @property
    def detected(self) -> np.ndarray:
        return ~np.isnan(self.landmarks[:, WRIST, 0])

    @property
    def detection_rate(self) -> float:
        return float(self.detected.mean()) if len(self.landmarks) else 0.0


def sample_indices(n_frames: int, k: int = GRAY_SAMPLES) -> set[int]:
    step = max(1, n_frames // k)
    return set(range(0, n_frames, step))


def track_video(path: str, tracker_factory=HandTracker, start_s: float = 0.0) -> HandTrack:
    """Stream frames once: landmarks for every frame, grayscale copies of ~10 for quality.
    Frames before `start_s` are skipped (decoded, not analysed): seeking is unreliable across codecs."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise TaskNotCompleted("I couldn't open that video. Please try recording it again.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    skip = 0
    if start_s > 0:
        # by timestamp where the container has them (MediaRecorder WebM often reports a bogus fps)
        while cap.grab():
            skip += 1
            pos = cap.get(cv2.CAP_PROP_POS_MSEC)
            if (pos >= start_s * 1000) if pos > 0 else (skip >= round(start_s * fps)):
                break
    max_frames = int(MAX_SECONDS * fps)
    expected = max(0, int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) - skip)
    keep = sample_indices(min(expected, max_frames) if expected > 0 else max_frames)
    grays: list[np.ndarray] = []
    sample_pts: list[np.ndarray | None] = []
    frames: list[np.ndarray] = []
    labels: list[str] = []
    missing = np.full((N_LANDMARKS, 2), np.nan)
    with tracker_factory() as tracker:
        while len(frames) < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            i = len(frames)
            pts, label = tracker.landmarks(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), int(i * 1000 / fps))
            if i in keep:
                grays.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
                sample_pts.append(pts)
            frames.append(missing if pts is None else pts)
            if label:
                labels.append(label)
    cap.release()
    if not frames:
        raise TaskNotCompleted("That video looks empty. Please record it again.")
    return HandTrack(
        fps=float(fps),
        landmarks=np.stack(frames),
        gray_samples=grays,
        sample_landmarks=sample_pts,
        hand_label=max(set(labels), key=labels.count) if labels else None,
    )


def save_track(path: str | Path, track: HandTrack) -> None:
    np.savez_compressed(path, fps=track.fps, landmarks=track.landmarks.astype(np.float32))


def load_track(path: str | Path) -> HandTrack:
    with np.load(path) as d:
        lm = np.asarray(d["landmarks"], dtype=float)
        fps = float(d["fps"])
    if lm.ndim != 3 or lm.shape[1:] != (N_LANDMARKS, 2) or fps <= 0:
        raise TaskNotCompleted("That landmark file isn't in the expected format.")
    return HandTrack(fps=fps, landmarks=lm[: int(MAX_SECONDS * fps)])


def load_hand_media(path: str, tracker_factory=HandTracker, start_s: float = 0.0) -> HandTrack:
    if str(path).endswith(".npz"):
        track = load_track(path)
        skip = int(round(start_s * track.fps))
        return HandTrack(fps=track.fps, landmarks=track.landmarks[skip:]) if skip else track
    return track_video(path, tracker_factory, start_s)


def fill_gaps(signal: np.ndarray) -> np.ndarray:
    """Linear-interpolate missing (NaN) frames; edges take the nearest value."""
    x = np.asarray(signal, dtype=float)
    ok = ~np.isnan(x)
    if ok.sum() < 2:
        raise TaskNotCompleted("I couldn't see your hand clearly. Make sure your whole hand stays in view.")
    idx = np.arange(len(x))
    return np.interp(idx, idx[ok], x[ok])
