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


def write_tremor_video(
    path: Path,
    freq_hz: float = 5.0,
    amplitude_px: float = 12.0,
    seconds: float = 10.4,
    fps: int = 30,
    canvas: int = 480,
    noise: float = 3.0,
    seed: int = 0,
    fourcc: str = "mp4v",
) -> Path:
    """The open-hand photo shaking diagonally at freq_hz, amplitude_px peak-to-peak."""
    hand = _load("hand_open.jpg", SIZE)
    base = np.full((canvas, canvas, 3), 150, np.uint8)
    off = (canvas - SIZE) // 2
    base[off : off + SIZE, off : off + SIZE] = hand
    rng = np.random.default_rng(seed)
    phase = rng.uniform(0, 2 * np.pi)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, (canvas, canvas))
    assert writer.isOpened(), f"cannot write {path}"
    for i in range(int(seconds * fps)):
        s = amplitude_px / 2 * np.sin(2 * np.pi * freq_hz * i / fps + phase)
        m = np.float32([[1, 0, s * 0.8], [0, 1, s * 0.6]])
        frame = cv2.warpAffine(base, m, (canvas, canvas), flags=cv2.INTER_LINEAR, borderValue=(150, 150, 150)).astype(np.float32)
        if noise:
            frame += rng.normal(0, noise, frame.shape)
        writer.write(np.clip(frame, 0, 255).astype(np.uint8))
    writer.release()
    return path
