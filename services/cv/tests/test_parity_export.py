"""The TypeScript port is tested against packages/cv/fixtures. This fails if those fixtures no
longer match what the Python modules compute; regenerate with scripts/export_parity_fixtures.py.

Numbers are compared with tolerances, not exactly: the synthetic tracks are built with NumPy's
sin/cos, whose SIMD implementations differ by a few ULP between CPUs, and that can flip a value
rounded to 4 decimals. The tolerances are far below what any real change to a module produces.
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.parity import build_fixtures

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "cv" / "fixtures"


def tolerance(path: str) -> tuple[float, float]:
    """(abs, rel) for a value at this path."""
    if path.startswith("tremor.") and ".landmarks" in path:
        return 1.5e-4, 0.0  # rounded to 4 dp: one rounding flip
    if path.startswith("taps.") and ".signal" in path:
        return 1.5e-9, 0.0  # rounded to 9 dp
    return 1e-9, 1e-6


def first_difference(a, b, path: str = "") -> str | None:
    """Path and values of the first mismatch, or None if equal within tolerance."""
    if isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            return f"{path}: keys differ {sorted(set(a) ^ set(b))}"
        for k in a:
            d = first_difference(a[k], b[k], f"{path}.{k}" if path else str(k))
            if d:
                return d
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_difference(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return None if a == b else f"{path}: {a!r} != {b!r}"
    abs_tol, rel_tol = tolerance(path)
    return None if math.isclose(a, b, abs_tol=abs_tol, rel_tol=rel_tol) else f"{path}: {a!r} != {b!r}"


@pytest.mark.skipif(not (FIXTURES / "expected.json").exists(), reason="fixtures not generated")
def test_committed_fixtures_are_current():
    images, expected = build_fixtures()
    committed = json.loads((FIXTURES / "expected.json").read_text())
    committed["tremor"] = json.loads((FIXTURES / "tremor.json").read_text())
    diff = first_difference(json.loads(json.dumps(expected)), committed)
    assert diff is None, f"fixtures are stale ({diff}); run scripts/export_parity_fixtures.py"
    for name, bgr in images.items():
        assert np.array_equal(cv2.imread(str(FIXTURES / name)), bgr), name


def test_comparison_catches_real_changes_and_ignores_rounding_noise():
    base = {"tremor": {"x": {"landmarks": [[[1.2345, 2.0]]], "expected": {"freq_hz": 5.0}}}, "taps": {"y": {"signal": [0.123456789]}}}
    noisy = json.loads(json.dumps(base))
    noisy["tremor"]["x"]["landmarks"][0][0][0] = 1.2346  # one 4-dp rounding flip
    noisy["taps"]["y"]["signal"][0] = 0.123456790
    assert first_difference(noisy, base) is None
    changed = json.loads(json.dumps(base))
    changed["tremor"]["x"]["expected"]["freq_hz"] = 5.01
    assert first_difference(changed, base) == "tremor.x.expected.freq_hz: 5.01 != 5.0"
    changed["tremor"]["x"]["landmarks"][0][0][0] = 1.2350
    assert "landmarks[0][0][0]" in first_difference(changed, base)
