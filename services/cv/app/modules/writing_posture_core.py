"""Pure landmark geometry shared by the CV module and isolated evaluation runner.

Inputs are 21-point, two-dimensional hand tracks. No diagnosis or clinical severity is
inferred from these measurements.
"""
from __future__ import annotations

import math

INDEX_MCP, INDEX_PIP, INDEX_DIP = 5, 6, 7


def index_pip_angle(frame: list[list[float]]) -> float | None:
    """Angle at the index PIP joint in degrees (180 means straight)."""
    try:
        a, b, c = (frame[i] for i in (INDEX_MCP, INDEX_PIP, INDEX_DIP))
        ux, uy = a[0] - b[0], a[1] - b[1]
        vx, vy = c[0] - b[0], c[1] - b[1]
        den = math.hypot(ux, uy) * math.hypot(vx, vy)
        if den < 1e-6 or not all(math.isfinite(v) for v in (ux, uy, vx, vy)):
            return None
        return math.degrees(math.acos(max(-1.0, min(1.0, (ux * vx + uy * vy) / den))))
    except (IndexError, TypeError, ValueError):
        return None


def evaluate_track(frames: list[list[list[float]]], fps: float, *, hold_s: float = 2.0,
                   straight_deg: float = 160.0, min_visible: float = 0.7,
                   min_duration_s: float = 6.0) -> dict:
    """Measure a fixed 2 s pen hold followed by writing from index finger landmarks."""
    if fps <= 0 or not frames:
        return {"accepted": False, "reason": "empty_or_invalid_track", "visible_fraction": 0.0}
    angles = [index_pip_angle(frame) for frame in frames]
    split = max(1, int(round(hold_s * fps)))
    hold = [a for a in angles[:split] if a is not None]
    writing = [(i, a) for i, a in enumerate(angles[split:], split) if a is not None]
    writing_frames = max(0, len(frames) - split)
    visible = len(writing) / writing_frames if writing_frames else 0.0
    hold_visible = len(hold) / min(split, len(frames))
    result = {"accepted": False, "reason": None, "visible_fraction": visible,
              "hold_visible_fraction": hold_visible,
              "duration_s": len(frames) / fps, "writing_frames": writing_frames,
              "valid_writing_frames": len(writing)}
    if len(frames) / fps < min_duration_s or hold_visible < min_visible or not writing:
        result["reason"] = "incomplete_hold_or_writing"
    elif visible < min_visible:
        result["reason"] = "index_landmarks_not_visible"
    else:
        values = [a for _, a in writing]
        ordered = sorted(values)
        median = ordered[len(ordered) // 2]
        example = min(writing, key=lambda item: abs(item[1] - median))[0]
        result.update({"accepted": True, "hold_angle_deg": sum(hold) / len(hold),
                       "writing_angle_deg": sum(values) / len(values),
                       "straight_fraction": sum(a >= straight_deg for a in values) / len(values),
                       "example_frame_s": example / fps})
    return result
