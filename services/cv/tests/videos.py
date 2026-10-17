"""Synthetic finger-tapping videos built from two real hand photos (open / closed).

Alternating the photos makes the thumb–index distance switch between ~1.06 and ~0.2 hand
widths, which MediaPipe's real hand landmarker tracks frame by frame.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

FIXTURES = Path(__file__).parent / "fixtures"
SIZE = 360


def _load(name: str, size: int = SIZE) -> np.ndarray:
    img = cv2.imread(str(FIXTURES / name))
    assert img is not None, name
    return cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)


def write_tapping_video(
    path: Path,
    rate_hz: float = 2.5,
    seconds: float = 10.4,
    fps: int = 30,
    brightness: float = 1.0,
    hand_visible_from: float = 0.0,
    fourcc: str = "mp4v",
    noise: float = 0.0,
    seed: int = 0,
    size: int = SIZE,
) -> Path:
    open_hand, closed_hand = _load("hand_open.jpg", size), _load("hand_closed.jpg", size)
    empty = np.full_like(open_hand, 150)
    half_cycle = fps / (2 * rate_hz)
    rng = np.random.default_rng(seed)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, (size, size))
    assert writer.isOpened(), f"cannot write {path}"
    for i in range(int(seconds * fps)):
        frame = open_hand if int(i // half_cycle) % 2 == 0 else closed_hand
        if i / fps < hand_visible_from:
            frame = empty
        out = frame.astype(np.float32) * brightness
        if noise:  # sensor noise: real cameras never produce two identical frames
            out += rng.normal(0, noise, out.shape)
        writer.write(np.clip(out, 0, 255).astype(np.uint8))
    writer.release()
    return path
