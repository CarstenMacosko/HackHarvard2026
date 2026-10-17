"""Pydantic mirror of packages/shared/src/schemas.ts. Change both together."""
from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field

ValidationStatus = Literal["validated", "reusable_needs_validation", "new_model_required"]
ReportValue = Union[str, float, int, bool]


class QualityCheck(BaseModel):
    name: str
    passed: bool
    value: Optional[float]
    threshold: Optional[float]
    message: str
    # advisory checks are recorded and shown to clinicians but never reject a capture
    advisory: bool = False


class QualityReport(BaseModel):
    accepted: bool
    checks: list[QualityCheck]
    retry_instructions: Optional[str]


class Measurement(BaseModel):
    name: str
    label: str
    value: float
    unit: str
    uncertainty: Optional[float]
    validation_status: ValidationStatus


class AnalyzeRequest(BaseModel):
    module: str
    media_url: Optional[str] = None
    study_id: str = "demo"
    participant_id: str = "demo"
    submission_id: str = "demo"
    task_label: str = ""
    captured_at: Optional[str] = None
    quality_criteria: dict[str, float] = Field(default_factory=dict)
    # video modules: seconds to skip at the start (live capture keeps a short framing segment)
    trim_start_s: Optional[float] = Field(default=None, ge=0, le=60)
    patient_report: dict[str, ReportValue] = Field(default_factory=dict)
    context: dict[str, ReportValue] = Field(default_factory=dict)


class AnalyzeResponse(BaseModel):
    """Observation in the shared format, review_status always starts as pending."""

    id: str
    study_id: str
    participant_id: str
    submission_id: str
    module: str
    task_label: str
    captured_at: str
    media_url: Optional[str]
    quality: QualityReport
    measurements: list[Measurement]
    # numeric feature vector for researcher-trained models (see packages/shared/src/models.ts)
    features: dict[str, float] = Field(default_factory=dict)
    model_version: str
    patient_report: dict[str, ReportValue]
    context: dict[str, ReportValue]
    review_status: Literal["pending"] = "pending"
    reviewer: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_note: Optional[str] = None
