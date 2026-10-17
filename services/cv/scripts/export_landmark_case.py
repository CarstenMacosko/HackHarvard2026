"""Export one video or .npz hand track as a Daytona evaluator manifest.

Run from services/cv: python -m scripts.export_landmark_case --input writing.mp4
  --case-id capture-1 --output /tmp/writing-cases.json
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from app.modules.hands import load_hand_media


def export_case(media_path: str, case_id: str) -> dict:
    track = load_hand_media(media_path)
    frames = [[[float(v) if math.isfinite(float(v)) else None for v in point]
               for point in frame] for frame in track.landmarks]
    return {"id": case_id, "fps": track.fps, "frames": frames}


def main() -> None:
    parser = argparse.ArgumentParser(description="Export 21-point hand landmarks for Daytona track evaluation")
    parser.add_argument("--input", required=True, help="Video or .npz hand track")
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--output", required=True, help="JSON manifest path")
    args = parser.parse_args()
    Path(args.output).write_text(json.dumps([export_case(args.input, args.case_id)], allow_nan=False) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
