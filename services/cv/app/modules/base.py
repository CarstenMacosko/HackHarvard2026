"""Contract every condition module implements. A module is a reusable pipeline:

    prepare(path)                -> decoded media + extracted signals (run once)
    quality_checks(prep, crit)   -> list[QualityCheck]   (is this capture usable?)
    measure(prep, crit)          -> MeasureResult        (only called if every check passed)

`MeasureResult.features` is a flat numeric vector. Researcher-trained models (linear heads
fitted in the web toolkit) read it, so feature names must match the on-device TypeScript
port in packages/cv exactly; tests/test_parity_export.py writes the fixtures that check this.

Algorithms (D) live as pure functions next to each module; the module class (B) wires them
into this interface so the pipeline, registry and workflow builder can compose them.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Literal

from ..models import Measurement, QualityCheck, ValidationStatus


class TaskNotCompleted(Exception):
    """Capture passed the image checks but the task itself wasn't done (e.g. no taps detected).
    The message is sent to the patient as a retry instruction."""


@dataclass(frozen=True)
class MeasurementSpec:
    name: str
    label: str
    unit: str
    validation_status: ValidationStatus = "reusable_needs_validation"


@dataclass
class MeasureResult:
    measurements: list[Measurement]
    features: dict[str, float] = field(default_factory=dict)


class CVModule(ABC):
    id: ClassVar[str]
    version: ClassVar[str]
    label: ClassVar[str]
    media_type: ClassVar[Literal["photo", "video"]]
    conditions: ClassVar[list[str]]
    components: ClassVar[list[str]]  # ids from the shared component catalog
    measurements: ClassVar[list[MeasurementSpec]]
    feature_names: ClassVar[list[str]]
    default_criteria: ClassVar[dict[str, float]]

    @abstractmethod
    def prepare(self, path: str) -> Any: ...

    @abstractmethod
    def quality_checks(self, prepared: Any, criteria: dict[str, float]) -> list[QualityCheck]: ...

    @abstractmethod
    def measure(self, prepared: Any, criteria: dict[str, float]) -> MeasureResult: ...

    @property
    def model_version(self) -> str:
        return f"{self.id}@{self.version}"

    def spec(self, name: str) -> MeasurementSpec:
        return next(m for m in self.measurements if m.name == name)

    def measurement(self, name: str, value: float, uncertainty: float | None) -> Measurement:
        s = self.spec(name)
        return Measurement(
            name=s.name,
            label=s.label,
            value=round(float(value), 4),
            unit=s.unit,
            uncertainty=None if uncertainty is None else round(float(uncertainty), 4),
            validation_status=s.validation_status,
        )

    @classmethod
    def describe(cls) -> dict[str, Any]:
        return {
            "id": cls.id,
            "version": cls.version,
            "label": cls.label,
            "media_type": cls.media_type,
            "conditions": cls.conditions,
            "components": cls.components,
            "measurements": [m.__dict__ for m in cls.measurements],
            "features": cls.feature_names,
            "default_criteria": cls.default_criteria,
        }
