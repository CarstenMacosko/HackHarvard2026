"""Write packages/cv/fixtures/* from the Python reference modules.

Run from services/cv:  python scripts/export_parity_fixtures.py
"""
import json
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.parity import build_fixtures  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "packages" / "cv" / "fixtures"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images, expected = build_fixtures()
    for name, bgr in images.items():
        cv2.imwrite(str(OUT / name), bgr)
    (OUT / "expected.json").write_text(json.dumps(expected, indent=1, sort_keys=True) + "\n")
    print(f"wrote {len(images)} images + expected.json to {OUT}")


if __name__ == "__main__":
    main()
