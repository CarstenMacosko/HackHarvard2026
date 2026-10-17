"""Repository paths, the local data cache, and access to the CV service's modules."""
from __future__ import annotations

import os
import sys
from pathlib import Path

TRAINING = Path(__file__).resolve().parents[1]
REPO = TRAINING.parent
CV_SERVICE = REPO / "services" / "cv"
STUDIES = TRAINING / "studies"
# downloaded media and computed features; never committed (see .gitignore)
CACHE = Path(os.environ.get("VFCV_CACHE") or TRAINING / ".cache")

if str(CV_SERVICE) not in sys.path:
    # the training kit measures captures with exactly the modules the product runs
    sys.path.insert(0, str(CV_SERVICE))


def cache_dir(*parts: str) -> Path:
    path = CACHE.joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path
