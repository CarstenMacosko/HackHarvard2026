"""Build one linked research visit report from three local captures or landmark tracks.

Run from services/cv: python -m scripts.visit_report --visit-id v1 --participant-id p1 \
  --task finger_tapping=tapping.npz --task hand_tremor=tremor.npz \
  --task writing_posture=writing.npz
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from app.models import AnalyzeRequest
from app.pipeline import analyze

TASKS = ("finger_tapping", "hand_tremor", "writing_posture")


def build_report(visit_id: str, participant_id: str, study_id: str,
                 captures: dict[str, str], captured_at: str | None = None) -> dict:
    report = {"visit_id": visit_id, "participant_id": participant_id,
              "study_id": study_id, "created_at": datetime.now(timezone.utc).isoformat(),
              "capture_time_source": "provided" if captured_at else "analysis_time_fallback",
              "status": "research_review_only", "tasks": []}
    for module in TASKS:
        media = captures.get(module)
        row = {"module": module, "media_path": media, "observation": None,
               "missing_reason": None}
        if not media:
            row["missing_reason"] = "capture_not_supplied"
        elif not Path(media).is_file():
            row["missing_reason"] = "capture_file_missing"
        else:
            try:
                observation = analyze(AnalyzeRequest(module=module, study_id=study_id,
                    participant_id=participant_id, submission_id=visit_id,
                    task_label=module.replace("_", " "),
                    captured_at=captured_at,
                    context={"visit_id": visit_id, "capture_protocol": "fixed view per task"}), media)
                row["observation"] = observation.model_dump(mode="json")
                if not observation.quality.accepted:
                    row["missing_reason"] = "quality_gate_failed"
            except Exception as exc:
                row["missing_reason"] = f"analysis_error: {type(exc).__name__}: {exc}"
        report["tasks"].append(row)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Link tapping, tremor, and writing CV observations into one research visit")
    parser.add_argument("--visit-id", required=True)
    parser.add_argument("--participant-id", required=True)
    parser.add_argument("--study-id", default="demo")
    parser.add_argument("--captured-at", help="ISO timestamp for this visit; otherwise observations use analysis time")
    parser.add_argument("--task", action="append", default=[], metavar="MODULE=PATH")
    parser.add_argument("--output", help="Write JSON to this path instead of stdout")
    args = parser.parse_args()
    if args.captured_at:
        try:
            datetime.fromisoformat(args.captured_at.replace("Z", "+00:00"))
        except ValueError:
            parser.error("--captured-at must be an ISO timestamp")
    captures: dict[str, str] = {}
    for item in args.task:
        if "=" not in item:
            parser.error("--task must be MODULE=PATH")
        module, media = item.split("=", 1)
        if module not in TASKS or module in captures:
            parser.error(f"--task module must be unique and one of {', '.join(TASKS)}")
        captures[module] = media
    content = json.dumps(build_report(args.visit_id, args.participant_id, args.study_id, captures, args.captured_at), indent=2)
    if args.output:
        Path(args.output).write_text(content + "\n", encoding="utf8")
    else:
        print(content)


if __name__ == "__main__":
    main()
