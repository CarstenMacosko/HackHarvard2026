import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import droid_gate  # noqa: E402
import droid_request  # noqa: E402

GOOD = {
    "request_id": "scaling-score-lq3k2a",
    "condition": "Plaque psoriasis",
    "measurement": {"name": "scaling_score", "label": "Scaling", "unit": "0-4"},
    "media_type": "photo",
    "description": "Track scaling on elbows weekly.",
    "requested_by": "Dr. Test",
    "unexpected": "dropped",
}


def test_valid_request_is_cleaned():
    req = droid_request.validate(json.dumps(GOOD))
    assert req["measurement"] == GOOD["measurement"]
    assert "unexpected" not in req


@pytest.mark.parametrize(
    "patch, message",
    [
        ({"request_id": "x; rm -rf /"}, "request_id"),
        ({"measurement": {"name": "Scaling Score", "label": "S", "unit": "u"}}, "snake_case"),
        ({"media_type": "audio"}, "media_type"),
        ({"description": "x" * 5000}, "description"),
        ({"condition": ""}, "condition"),
    ],
)
def test_bad_requests_are_rejected(patch, message):
    with pytest.raises(droid_request.RequestError, match=message):
        droid_request.validate(json.dumps({**GOOD, **patch}))


def test_request_must_be_json():
    with pytest.raises(droid_request.RequestError, match="JSON"):
        droid_request.validate("not json")


def test_gate_rejects_forbidden_paths_and_media():
    problems, _ = droid_gate.check([".github/workflows/ci.yml", "apps/web/app/api/models/route.ts", "package-lock.json", "training/data/x.jpg"])
    text = "\n".join(problems)
    assert ".github/workflows/ci.yml: Droid may not change this path" in text
    assert "apps/web/app/api/models/route.ts" in text
    assert "package-lock.json" in text
    assert "media and model weights stay out of git" in text
    assert "no study was added" in text


def test_gate_requires_droid_provenance_on_new_models():
    # a committed study trained by the kit, not by Droid: the gate must notice
    problems, results = droid_gate.check(["training/studies/tremor_updrs_synthetic/model.json"])
    assert any("--source droid" in p for p in problems)
    assert results[0]["outcome"] == "trained"


def test_gate_accepts_a_study_blocked_on_data(tmp_path, monkeypatch):
    study = droid_gate.REPO / "training" / "studies" / "zz_gate_test_needs_data"
    study.mkdir()
    try:
        (study / "study.yaml").write_text(
            "id: zz_gate_test_needs_data\nname: Gate test\ndescription: d\ncondition: psoriasis\nmodule: eczema_photo\n"
            "dataset: folder\ndataset_options: {path: data/zz}\ntarget: {name: pasi_score, label: PASI, unit: '0-72', source_label: pasi, kind: score}\n"
        )
        (study / "DATA_NEEDED.md").write_text("PASI-graded photos needed.\n")
        problems, results = droid_gate.check(["training/studies/zz_gate_test_needs_data/study.yaml", "training/studies/zz_gate_test_needs_data/DATA_NEEDED.md"])
        assert problems == []
        assert results == [{"study": "zz_gate_test_needs_data", "outcome": "needs_data", "name": "Gate test"}]
        assert "needs data" in droid_gate.summary_markdown(problems, results)
    finally:
        for f in study.iterdir():
            f.unlink()
        study.rmdir()
