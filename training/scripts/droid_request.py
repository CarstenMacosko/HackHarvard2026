"""Validate a "new study model" request and write it where Droid reads it.

The request arrives from the web app's workflow builder (POST /api/droid/jobs → GitHub
workflow_dispatch) as JSON in the DROID_REQUEST environment variable. It is untrusted text:
it is parsed and checked here, written to .droid/request.json, and never interpolated into a
shell command.

    DROID_REQUEST='{"request_id": "...", ...}' python training/scripts/droid_request.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SLUG = re.compile(r"^[a-z][a-z0-9_]{1,48}$")
REQUEST_ID = re.compile(r"^[a-z0-9][a-z0-9-]{3,40}$")
LIMITS = {"condition": 80, "description": 2000, "dataset_hint": 300, "requested_by": 80, "study_id": 60}


class RequestError(ValueError):
    pass


def validate(raw: str) -> dict:
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RequestError(f"request is not valid JSON: {e}") from None
    if not isinstance(req, dict):
        raise RequestError("request must be a JSON object")
    problems = []
    if not REQUEST_ID.match(str(req.get("request_id", ""))):
        problems.append("request_id must be 4-41 lowercase letters, digits or dashes")
    m = req.get("measurement")
    if not isinstance(m, dict):
        problems.append("measurement must be an object with name, label and unit")
        m = {}
    elif not SLUG.match(str(m.get("name", ""))):
        problems.append("measurement.name must be snake_case")
    for key in ("label", "unit"):
        if not isinstance(m.get(key), str) or not m.get(key) or len(m[key]) > 80:
            problems.append(f"measurement.{key} must be a short string")
    if req.get("media_type") not in ("photo", "video"):
        problems.append("media_type must be photo or video")
    for key, limit in LIMITS.items():
        v = req.get(key)
        if v is not None and (not isinstance(v, str) or len(v) > limit):
            problems.append(f"{key} must be a string of at most {limit} characters")
    if not req.get("condition"):
        problems.append("condition is required")
    if problems:
        raise RequestError("; ".join(problems))
    keep = ("request_id", "condition", "measurement", "media_type", "description", "dataset_hint", "study_id", "requested_by", "task")
    clean = {k: req[k] for k in keep if k in req}
    clean["measurement"] = {k: m[k] for k in ("name", "label", "unit")}
    return clean


def main() -> int:
    try:
        req = validate(os.environ.get("DROID_REQUEST", ""))
    except RequestError as e:
        print(f"::error::{e}")
        return 1
    out = REPO / ".droid"
    out.mkdir(exist_ok=True)
    (out / "request.json").write_text(json.dumps(req, indent=2) + "\n")
    print(f"request {req['request_id']}: {req['measurement']['label']} for {req['condition']} ({req['media_type']})")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"request_id={req['request_id']}\n")
            f.write(f"slug={req['measurement']['name']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
