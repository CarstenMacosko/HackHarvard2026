"""Study model specs: `training/studies/<slug>/study.yaml`.

A spec says which CV module measures the captures, which dataset and label to learn from,
and how to judge the result. It is the only file a researcher (or Droid) has to write to
train a new study model; `python -m vfcv.run training/studies/<slug>` does the rest.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

TargetKind = Literal["probability", "binary", "score"]
SLUG = re.compile(r"^[a-z][a-z0-9_]{1,48}$")


class SpecError(ValueError):
    pass


@dataclass
class Target:
    name: str  # measurement name shown in the app (snake_case)
    label: str
    unit: str
    source_label: str  # label key provided by the dataset loader
    kind: TargetKind = "score"


@dataclass
class StudySpec:
    id: str
    name: str
    description: str
    condition: str
    module: str
    dataset: str
    target: Target
    dataset_options: dict[str, Any] = field(default_factory=dict)
    features: list[str] | None = None  # default: every feature the module exports
    feature_groups: list[str] = field(default_factory=list)  # optional extra groups, e.g. "embedding"
    quality: Literal["passed", "all"] = "passed"
    subgroup: str | None = None  # Example.meta key reported per subgroup, e.g. "fitzpatrick"
    lambdas: list[float] | None = None
    select_by: Literal["mae", "rmse"] = "mae"
    folds: int = 5
    study_id: str | None = None  # restrict the model to one study; null = any study using the module
    intended_use: str = ""
    limitations: list[str] = field(default_factory=list)
    path: Path | None = None


def load_spec(study_dir: Path | str) -> StudySpec:
    study_dir = Path(study_dir).resolve()
    path = study_dir / "study.yaml" if study_dir.is_dir() else study_dir
    raw = yaml.safe_load(path.read_text())
    if not isinstance(raw, dict):
        raise SpecError(f"{path}: expected a mapping")
    try:
        target = Target(**raw.pop("target"))
        spec = StudySpec(target=target, **raw, path=path)
    except TypeError as e:
        raise SpecError(f"{path}: {e}") from None
    validate(spec)
    return spec


def validate(spec: StudySpec) -> None:
    from . import datasets
    from .features import module_info

    problems = []
    if not SLUG.match(spec.id):
        problems.append(f"id {spec.id!r} must be snake_case")
    if spec.path is not None and spec.path.parent.name != spec.id:
        problems.append(f"id {spec.id!r} must match its folder name {spec.path.parent.name!r}")
    if not SLUG.match(spec.target.name):
        problems.append(f"target.name {spec.target.name!r} must be snake_case")
    if spec.target.kind not in ("probability", "binary", "score"):
        problems.append(f"target.kind must be probability, binary or score")
    if spec.dataset not in datasets.LOADERS:
        problems.append(f"unknown dataset {spec.dataset!r}; known: {sorted(datasets.LOADERS)}")
    else:
        info = datasets.info(spec.dataset, spec.dataset_options)
        if info.label_kinds and spec.target.source_label not in info.label_kinds:
            problems.append(f"dataset {spec.dataset!r} has no label {spec.target.source_label!r}; it has {sorted(info.label_kinds)}")
    try:
        mod = module_info(spec.module)
        if spec.features:
            unknown = [f for f in spec.features if f not in mod["features"]]
            if unknown:
                problems.append(f"module {spec.module!r} has no features {unknown}")
    except KeyError as e:
        problems.append(str(e))
    unknown_groups = [g for g in spec.feature_groups if g not in ("embedding",)]
    if unknown_groups:
        problems.append(f"unknown feature groups {unknown_groups}")
    if spec.select_by not in ("mae", "rmse"):
        problems.append("select_by must be mae or rmse")
    if spec.folds < 2:
        problems.append("folds must be at least 2")
    if problems:
        raise SpecError("; ".join(problems))
