"""Synthetic hand landmark tracks with known ground truth.

Used by the tests, the on-device parity fixtures and the training kit's synthetic datasets.
The hand shape is a real one: MediaPipe's landmarks for tests/fixtures/hand_open.jpg.
A track tests everything after landmark detection; the real-video tests (tests/videos.py)
cover detection itself.
"""
from __future__ import annotations

import numpy as np

from .modules.hands import INDEX_TIP, MIDDLE_MCP, THUMB_TIP, WRIST, HandTrack

# normalised (x, y) for the 21 landmarks of an open right hand, palm facing the camera
HAND_TEMPLATE = np.array(
    [
        [0.479, 0.742], [0.54, 0.662], [0.577, 0.561], [0.526, 0.502], [0.443, 0.495],
        [0.473, 0.439], [0.48, 0.329], [0.484, 0.258], [0.473, 0.196], [0.391, 0.472],
        [0.418, 0.422], [0.458, 0.524], [0.451, 0.555], [0.331, 0.518], [0.357, 0.487],
        [0.408, 0.574], [0.4, 0.592], [0.278, 0.574], [0.309, 0.54], [0.355, 0.592],
        [0.348, 0.61],
    ]
)
FINGERS = np.arange(5, 21)  # index to little finger, which bend at the knuckles in finger tremor


def base_hand(scale_px: float = 150.0, centre=(320.0, 260.0)) -> np.ndarray:
    """(21, 2) pixel landmarks for a hand whose wrist–middle-knuckle distance is scale_px."""
    t = HAND_TEMPLATE - HAND_TEMPLATE.mean(axis=0)
    t = t / np.linalg.norm(HAND_TEMPLATE[WRIST] - HAND_TEMPLATE[MIDDLE_MCP]) * scale_px
    return t + np.asarray(centre)


def _finish(frames: np.ndarray, fps: float, jitter_px: float, missing: float, rng: np.random.Generator) -> HandTrack:
    if jitter_px:  # landmark detector noise, independent per point and frame
        frames = frames + rng.normal(0, jitter_px, frames.shape)
    if missing:
        drop = rng.random(len(frames)) < missing
        frames[drop] = np.nan
    return HandTrack(fps=float(fps), landmarks=frames)


def tremor_track(
    freq_hz: float = 5.0,
    amplitude: float = 0.1,
    finger_amplitude: float = 0.0,
    seconds: float = 12.0,
    fps: float = 30.0,
    direction_deg: float = 30.0,
    drift: float = 0.0,
    jitter: float = 0.004,
    missing: float = 0.0,
    scale_px: float = 150.0,
    seed: int = 0,
) -> HandTrack:
    """A hand oscillating at freq_hz with the given peak-to-peak amplitude (hand-size units),
    optionally with fingers flexing at the knuckles (finger_amplitude, peak-to-peak at the
    fingertip), slow wander (drift, hand units RMS) and detector jitter (hand units)."""
    rng = np.random.default_rng(seed)
    n = int(round(seconds * fps))
    t = np.arange(n) / fps
    hand = base_hand(scale_px)
    phase = rng.uniform(0, 2 * np.pi)
    osc = np.sin(2 * np.pi * freq_hz * t + phase)
    d = np.deg2rad(direction_deg)
    shift = (amplitude / 2 * scale_px) * osc[:, None] * np.array([np.cos(d), np.sin(d)])
    if drift:
        # band-limited wander below 1 Hz: a few slow sinusoids with random phases
        for f0 in (0.13, 0.31, 0.57):
            shift += (drift * scale_px / np.sqrt(3) * np.sqrt(2)) * np.sin(2 * np.pi * f0 * t + rng.uniform(0, 6.3))[:, None] * np.array(
                [rng.uniform(0.5, 1), rng.uniform(0.5, 1)]
            )
    frames = np.repeat(hand[None], n, axis=0) + shift[:, None, :]
    if finger_amplitude:
        # rotate the fingers about the knuckle line so the index tip moves finger_amplitude p-p
        knuckle = hand[MIDDLE_MCP]
        reach = np.linalg.norm(hand[INDEX_TIP] - knuckle)
        theta = (finger_amplitude / 2 * scale_px / reach) * np.sin(2 * np.pi * freq_hz * t + phase + 0.7)
        c, s = np.cos(theta), np.sin(theta)
        rel = hand[FINGERS] - knuckle
        rot = np.stack([c[:, None] * rel[:, 0] - s[:, None] * rel[:, 1], s[:, None] * rel[:, 0] + c[:, None] * rel[:, 1]], axis=-1)
        frames[:, FINGERS] = rot + knuckle + shift[:, None, :]
    return _finish(frames, fps, jitter * scale_px, missing, rng)


def tapping_track(
    distance: np.ndarray,
    fps: float = 30.0,
    jitter: float = 0.004,
    missing: float = 0.0,
    scale_px: float = 150.0,
    seed: int = 0,
) -> HandTrack:
    """A hand whose thumb–index distance follows `distance` (hand-size units, per frame)."""
    rng = np.random.default_rng(seed)
    hand = base_hand(scale_px)
    direction = hand[INDEX_TIP] - hand[THUMB_TIP]
    direction /= np.linalg.norm(direction)
    frames = np.repeat(hand[None], len(distance), axis=0)
    frames[:, INDEX_TIP] = hand[THUMB_TIP] + np.asarray(distance)[:, None] * scale_px * direction
    return _finish(frames, fps, jitter * scale_px, missing, rng)


def tap_distance(
    rate_hz: float = 3.0,
    seconds: float = 12.0,
    fps: float = 30.0,
    amplitude: float = 1.0,
    decrement: float = 0.0,
    decrement_onset: float = 1.0,
    hesitations: int = 0,
    freeze_s: float = 0.0,
    rate_slowing: float = 0.0,
    irregularity: float = 0.0,
    closed: float = 0.1,
    seed: int = 0,
) -> np.ndarray:
    """Thumb–index distance for a finger-tapping sequence (MDS-UPDRS 3.4 ingredients).

    - amplitude: opening at the start (hand-size units); `closed` is the touching distance
    - decrement: fractional amplitude loss by the end, starting at `decrement_onset`
      (fraction of the sequence: 0 = after the first tap, 1 = never)
    - hesitations: brief pauses (0.25-0.5 s) with the fingers closed; freeze_s: one longer arrest
    - rate_slowing: fractional rate loss by the end; irregularity: CV of tap intervals
    """
    rng = np.random.default_rng(seed)
    n = int(round(seconds * fps))
    t_end = seconds
    # build tap cycles one by one so pauses and irregular intervals are exact
    cycles: list[tuple[float, float, float]] = []  # (start, duration, peak amplitude)
    t = 0.0
    k = 0
    pauses = sorted(rng.uniform(0.15, 0.9, hesitations)) if hesitations else []
    freeze_at = rng.uniform(0.3, 0.7) if freeze_s else None
    while t < t_end:
        frac = t / t_end
        rate = rate_hz * (1 - rate_slowing * frac)
        dur = max(1 / 8, (1 / max(rate, 0.2)) * (1 + irregularity * rng.standard_normal()))
        amp = amplitude
        if decrement and frac >= decrement_onset:
            span = max(1e-6, 1 - decrement_onset)
            amp = amplitude * (1 - decrement * (frac - decrement_onset) / span)
        cycles.append((t, dur, max(amp, 0.0)))
        t += dur
        k += 1
        while pauses and t / t_end >= pauses[0]:
            pauses.pop(0)
            t += rng.uniform(0.25, 0.5)
        if freeze_at is not None and t / t_end >= freeze_at:
            t += freeze_s
            freeze_at = None
    times = np.arange(n) / fps
    d = np.full(n, closed)
    for start, dur, amp in cycles:
        inside = (times >= start) & (times < start + dur)
        phase = (times[inside] - start) / dur
        d[inside] = closed + amp * (0.5 - 0.5 * np.cos(2 * np.pi * phase))
    return d
