"""Dataset loaders available to study specs (`dataset:` in study.yaml).

Add a loader by writing `load(**options) -> list[Example]` and a `DatasetInfo`, then listing
it here and in training/DATASETS.md (licence, access, labels and what they can support).
"""
from __future__ import annotations

from typing import Callable

from . import fitzpatrick17k, folder, scin, synthetic
from .base import DatasetInfo, Example

LOADERS: dict[str, Callable[..., list[Example]]] = {
    "scin": scin.load,
    "fitzpatrick17k": fitzpatrick17k.load,
    "folder": folder.load,
    "synthetic_tapping": synthetic.load_tapping,
    "synthetic_tremor": synthetic.load_tremor,
}


def info(name: str, options: dict | None = None) -> DatasetInfo:
    if name == "folder":
        return folder.info((options or {}).get("path"))
    return {
        "scin": scin.INFO,
        "fitzpatrick17k": fitzpatrick17k.INFO,
        "synthetic_tapping": synthetic.TAPPING_INFO,
        "synthetic_tremor": synthetic.TREMOR_INFO,
    }[name]


def load(name: str, options: dict | None = None) -> list[Example]:
    return LOADERS[name](**(options or {}))
