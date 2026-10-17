"""Measure training captures with the product's own CV modules.

Every capture goes through the same steps as a participant upload: prepare, quality gate,
measure. The kit records whether the capture passed the gate and the module's feature vector.
Results are cached per module version, so several studies on one dataset measure it once.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .datasets.base import Example
from .paths import cache_dir

CACHE_FORMAT = 2  # bump when Measured gains fields, so old caches are recomputed


@dataclass
class Measured:
    id: str
    passed: bool
    failed: list[str] = field(default_factory=list)
    features: dict[str, float] = field(default_factory=dict)
    error: str | None = None
    checks: dict[str, float | None] = field(default_factory=dict)  # quality-check values, for gate calibration


def module_info(module_id: str) -> dict:
    from app import registry  # services/cv, on sys.path via vfcv.paths

    for m in registry.catalog():
        if m["id"] == module_id:
            return m
    raise KeyError(f"unknown CV module {module_id!r}; known: {sorted(m['id'] for m in registry.catalog())}")


def measure_one(module_id: str, ex_id: str, media_path: str) -> Measured:
    from app import registry
    from app.modules.base import TaskNotCompleted

    module = registry.get(module_id)
    try:
        prepared = module.prepare(media_path)
        checks = module.quality_checks(prepared, dict(module.default_criteria))
        failed = [c.name for c in checks if not c.passed]
        values = {c.name: c.value for c in checks}
        try:
            result = module.measure(prepared, dict(module.default_criteria))
        except TaskNotCompleted:
            return Measured(ex_id, passed=False, failed=failed + ["task_completed"], checks=values)
        # features are recorded even for captures that fail the gate, so studies can
        # choose to train on every capture (quality: all) and so exclusions can be audited
        return Measured(ex_id, passed=not failed, failed=failed, features={k: float(v) for k, v in result.features.items()}, checks=values)
    except TaskNotCompleted as e:
        return Measured(ex_id, passed=False, failed=["task_completed"], error=str(e))
    except Exception as e:  # a corrupt file must not stop a 6,000-capture run
        return Measured(ex_id, passed=False, failed=["error"], error=f"{type(e).__name__}: {e}")


def _cache_path(module_id: str) -> Path:
    """One cache per module version and quality-gate defaults (pass/fail depends on both)."""
    info = module_info(module_id)
    criteria = hashlib.sha1(json.dumps(info["default_criteria"], sort_keys=True).encode()).hexdigest()[:8]
    return cache_dir("features") / f"{module_id}@{info['version']}-{criteria}.v{CACHE_FORMAT}.jsonl"


def _read_cache(path: Path) -> dict[str, Measured]:
    out: dict[str, Measured] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip():
                d = json.loads(line)
                out[d["id"]] = Measured(**d)
    return out


def _worker(args: tuple[str, str, str]) -> Measured:
    return measure_one(*args)


def measure_all(module_id: str, examples: list[Example], workers: int | None = None) -> dict[str, Measured]:
    path = _cache_path(module_id)
    cached = _read_cache(path)
    todo = [(module_id, e.id, e.media_path) for e in examples if e.id not in cached]
    if todo:
        workers = workers or max(1, (os.cpu_count() or 2))
        print(f"features: measuring {len(todo)} captures with {module_id} ({workers} workers)", file=sys.stderr, flush=True)
        with open(path, "a") as f, ProcessPoolExecutor(workers) as pool:
            for i, m in enumerate(pool.map(_worker, todo, chunksize=4)):
                cached[m.id] = m
                f.write(json.dumps(m.__dict__) + "\n")
                if (i + 1) % 200 == 0:
                    f.flush()
                    print(f"features: {i + 1}/{len(todo)}", file=sys.stderr, flush=True)
    return {e.id: cached[e.id] for e in examples}
