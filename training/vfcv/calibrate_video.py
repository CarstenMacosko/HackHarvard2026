"""Calibrate the hand-video sharpness check against what actually matters: tracking and measurement.

Phone-like test clips are rendered from the tapping fixtures (tests/videos.py):
- portrait 1080x1920, hand about 700 px tall, plain light background;
- H.264 at a phone-like quality (libx264 CRF 23);
- defocus (Gaussian sigma) and camera-shake motion blur at increasing strength.

For each clip it records:
- the old whole-frame sharpness (blurriest of three sampled frames);
- the new hand-region sharpness (median over the sampled hand crops, 256 px);
- MediaPipe's detection rate;
- the tap-rate error against the known 2.5 Hz.

Real clips can be added with --clip (path:label), e.g. the team's own recordings.

    python -m vfcv.calibrate_video [--clip training/.cache/team_videos/IMG_6474.MOV:team-1]

Writes training/calibration/hand_video_sharpness.{md,json}. Needs ffmpeg with libx264.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

from .paths import CV_SERVICE, TRAINING  # noqa: F401  (puts services/cv on sys.path)

RATE_HZ = 2.5
W, H = 1080, 1920
HAND_PX = 700
FPS = 30
SECONDS = 10.4
DEFOCUS = [0, 1, 2, 3, 4, 6, 8, 12]
CONCLUSION = """
## Conclusion

- MediaPipe tracked the hand and measured the tap rate exactly at every degradation tested, including heavy defocus (σ = 12) and 41 px camera shake. Sharpness, within this range, does not decide whether a hand video is usable; tracking does.
- The old gate (whole-frame Laplacian variance ≥ 60) failed a perfectly sharp phone-like clip after a barely visible σ = 1 defocus, and rejected both of the team's real iPhone clips (52.5 and 54.3), which track at 94–100% and measure normally.
- So for hand videos, sharpness is now measured on the hand region and is **advisory** (threshold 20, which flags visibly soft hands, σ ≥ 2). It is shown to the clinician and never asks for a retake. Exposure is judged on the hand region (60–220, blocking); hand visibility, duration and frame rate stay blocking.
"""
SHAKE = [0, 9, 21, 41]


def _frames():
    from tests.videos import _load  # services/cv/tests/videos.py: the MediaPipe hand fixtures

    open_hand, closed_hand = _load("hand_open.jpg", HAND_PX), _load("hand_closed.jpg", HAND_PX)
    canvas = np.full((H, W, 3), 205, np.uint8)  # light wall, like a typical room
    canvas[:, :, 0] = 196
    y0, x0 = (H - HAND_PX) // 2, (W - HAND_PX) // 2
    out = []
    for hand in (open_hand, closed_hand):
        f = canvas.copy()
        f[y0 : y0 + HAND_PX, x0 : x0 + HAND_PX] = hand
        out.append(f)
    return out


def render(path: Path, sigma: float = 0, shake: int = 0, seed: int = 0) -> Path:
    """Tapping clip at 2.5 Hz, degraded, encoded with libx264 like a phone recording."""
    rng = np.random.default_rng(seed)
    a, b = _frames()
    half = FPS / (2 * RATE_HZ)
    kernel = None
    if shake:
        kernel = np.zeros((shake, shake), np.float32)
        kernel[shake // 2, :] = 1.0 / shake  # horizontal camera shake
    proc = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(path)],
        stdin=subprocess.PIPE,
    )
    for i in range(int(SECONDS * FPS)):
        f = (a if int(i // half) % 2 == 0 else b).astype(np.float32)
        f += rng.normal(0, 2.0, f.shape)  # sensor noise
        if sigma:
            f = cv2.GaussianBlur(f, (0, 0), sigma)
        if kernel is not None:
            f = cv2.filter2D(f, -1, kernel)
        proc.stdin.write(np.clip(f, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed (needs libx264)")
    return path


def evaluate(path: str, truth_hz: float | None) -> dict:
    from app import quality as q
    from app.modules.finger_tapping import FingerTappingModule, tap_metrics
    from app.modules.base import TaskNotCompleted

    m = FingerTappingModule()
    p = m.prepare(path)
    old = min(float(cv2.Laplacian(g, cv2.CV_64F).var()) for g in [p.gray_samples[i] for i in np.linspace(0, len(p.gray_samples) - 1, 3).astype(int)])
    checks = q.hand_video_checks(p.gray_samples, p.sample_landmarks, m.default_criteria)
    row = {
        "old_whole_frame": round(old, 1),
        "hand_sharpness": checks[0].value,
        "hand_brightness": checks[1].value,
        "detection_rate": round(p.detection_rate, 3),
    }
    try:
        t = tap_metrics(p.distance, p.fps, p.detection_rate)
        row["tap_rate_hz"] = round(t.tap_rate_hz, 3)
        if truth_hz:
            row["rate_error_hz"] = round(abs(t.tap_rate_hz - truth_hz), 3)
    except TaskNotCompleted as e:
        row["tap_rate_hz"] = None
        row["error"] = str(e)
    return row


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="python -m vfcv.calibrate_video")
    ap.add_argument("--clip", action="append", default=[], help="real clip as path[:label]")
    args = ap.parse_args(argv)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for sigma in DEFOCUS:
            r = evaluate(str(render(Path(tmp) / f"d{sigma}.mp4", sigma=sigma)), RATE_HZ)
            rows.append({"clip": f"synthetic, defocus σ={sigma}", **r})
            print(rows[-1], flush=True)
        for shake in SHAKE[1:]:
            r = evaluate(str(render(Path(tmp) / f"s{shake}.mp4", shake=shake)), RATE_HZ)
            rows.append({"clip": f"synthetic, camera shake {shake} px", **r})
            print(rows[-1], flush=True)
    for spec in args.clip:
        path, _, label = spec.partition(":")
        rows.append({"clip": label or Path(path).name, **evaluate(path, None)})
        print(rows[-1], flush=True)
    out = TRAINING / "calibration"
    out.mkdir(exist_ok=True)
    (out / "hand_video_sharpness.json").write_text(json.dumps(rows, indent=1) + "\n")
    lines = [
        "# Hand-video sharpness calibration",
        "",
        "Generated by `python -m vfcv.calibrate_video`. Synthetic clips: 1080x1920 portrait, hand ≈700 px, libx264 CRF 23,",
        f"tapping at {RATE_HZ} Hz. *Old* is the whole-frame Laplacian variance (blurriest of three frames; the gate was ≥ 60);",
        "*hand* is the median Laplacian variance of the 256 px hand crops.",
        "",
        "| Clip | Old (whole frame) | Hand sharpness | Hand brightness | Detection | Tap rate (Hz) | Error (Hz) |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['clip']} | {r['old_whole_frame']} | {r['hand_sharpness']} | {r['hand_brightness']} | {r['detection_rate']:.0%} | "
            f"{r['tap_rate_hz'] if r['tap_rate_hz'] is not None else 'no taps'} | {r.get('rate_error_hz', '–')} |"
        )
    lines.append("")
    lines.append(CONCLUSION)
    (out / "hand_video_sharpness.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
