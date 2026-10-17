"""Config-driven pipeline: protocol task config → quality gate → module → shared Observation."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from . import embedding, registry
from .models import AnalyzeRequest, AnalyzeResponse, Measurement, QualityCheck
from .modules.base import CVModule, MeasureResult, TaskNotCompleted
from .quality import build_report


def run_prepared(module: CVModule, prepared: Any, req: AnalyzeRequest, embed: bool = True) -> AnalyzeResponse:
    criteria = {**module.default_criteria, **req.quality_criteria}
    checks = module.quality_checks(prepared, criteria)
    result = MeasureResult(measurements=[])
    if all(c.passed or c.advisory for c in checks):
        try:
            result = module.measure(prepared, criteria)
        except TaskNotCompleted as e:
            checks.append(task_failed(str(e)))
        else:
            if embed:
                result.features.update(photo_embedding(module, prepared))
    return assemble(module, req, checks, result.measurements, result.features)


def photo_embedding(module: CVModule, prepared: Any) -> dict[str, float]:
    """Image-embedding features for accepted photos, so trained heads that read them apply
    (the browser adds the same features on-device). Skipped, not fatal, if unavailable."""
    bgr = getattr(prepared, "bgr", None)
    if module.media_type != "photo" or bgr is None or os.environ.get("EMBEDDINGS", "1") == "0" or not embedding.available():
        return {}
    try:
        return embedding.embed_bgr(bgr)
    except Exception as e:  # e.g. model download blocked: measurements still stand
        logging.getLogger(__name__).warning("image embedding skipped: %s", e)
        return {}


def analyze(req: AnalyzeRequest, media_path: str) -> AnalyzeResponse:
    module = registry.get(req.module)
    try:
        prepared = module.prepare(media_path)
    except TaskNotCompleted as e:
        return assemble(module, req, [task_failed(str(e))], [], {})
    return run_prepared(module, prepared, req)


def task_failed(message: str) -> QualityCheck:
    return QualityCheck(name="task_completed", passed=False, value=None, threshold=None, message=message)


def assemble(
    module: CVModule,
    req: AnalyzeRequest,
    checks: list[QualityCheck],
    measurements: list[Measurement],
    features: dict[str, float],
) -> AnalyzeResponse:
    return AnalyzeResponse(
        id=f"obs_{uuid.uuid4().hex[:12]}",
        study_id=req.study_id,
        participant_id=req.participant_id,
        submission_id=req.submission_id,
        module=module.id,
        task_label=req.task_label or module.label,
        captured_at=req.captured_at or datetime.now(timezone.utc).isoformat(),
        media_url=req.media_url,
        quality=build_report(checks),
        measurements=measurements,
        features={k: round(float(v), 6) for k, v in features.items()},
        model_version=module.model_version,
        patient_report=req.patient_report,
        context=req.context,
    )
