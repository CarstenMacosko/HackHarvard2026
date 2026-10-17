"""What every dataset loader returns: labelled captures plus where they came from."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

LabelKind = Literal["expert", "self_report", "synthetic", "researcher"]


@dataclass
class Example:
    id: str  # unique and stable: used as the feature-cache key
    group: str  # captures that must stay in the same CV fold (same person / case)
    media_path: str
    labels: dict[str, float]
    meta: dict[str, str] = field(default_factory=dict)  # subgroup keys, e.g. fitzpatrick


@dataclass
class DatasetInfo:
    name: str
    title: str
    licence: str
    url: str
    citation: str
    media_type: Literal["photo", "video"]
    label_kinds: dict[str, LabelKind]  # label name -> where the label comes from
    notes: str = ""
