"""The TypeScript port is tested against packages/cv/fixtures. This fails if those fixtures no
longer match what the Python modules compute; regenerate with scripts/export_parity_fixtures.py."""
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.parity import build_fixtures

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "cv" / "fixtures"


@pytest.mark.skipif(not (FIXTURES / "expected.json").exists(), reason="fixtures not generated")
def test_committed_fixtures_are_current():
    images, expected = build_fixtures()
    committed = json.loads((FIXTURES / "expected.json").read_text())
    assert json.loads(json.dumps(expected)) == committed
    for name, bgr in images.items():
        assert np.array_equal(cv2.imread(str(FIXTURES / name)), bgr), name
