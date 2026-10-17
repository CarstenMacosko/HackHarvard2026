from pathlib import Path

import pytest

from vfcv.paths import STUDIES
from vfcv.spec import SpecError, load_spec

STUDY_DIRS = sorted(p.parent for p in STUDIES.glob("*/study.yaml"))


@pytest.mark.parametrize("study", STUDY_DIRS, ids=lambda p: p.name)
def test_every_committed_study_validates(study):
    spec = load_spec(study)
    assert spec.id == study.name


def write(tmp_path: Path, folder: str, body: str) -> Path:
    d = tmp_path / folder
    d.mkdir()
    (d / "study.yaml").write_text(body)
    return d


BASE = """
id: {id}
name: Test
description: Test study
condition: eczema
module: {module}
dataset: {dataset}
target: {{name: {target}, label: Test, unit: "0-1", source_label: {label}, kind: probability}}
"""


def test_valid_spec(tmp_path):
    d = write(tmp_path, "ok_study", BASE.format(id="ok_study", module="eczema_photo", dataset="scin", target="t_score", label="eczema"))
    assert load_spec(d).target.source_label == "eczema"


@pytest.mark.parametrize(
    "fields, message",
    [
        (dict(id="wrong_name", module="eczema_photo", dataset="scin", target="t", label="eczema"), "must match its folder"),
        (dict(id="bad_study", module="no_such_module", dataset="scin", target="t_s", label="eczema"), "unknown CV module"),
        (dict(id="bad_study", module="eczema_photo", dataset="imagenet", target="t_s", label="eczema"), "unknown dataset"),
        (dict(id="bad_study", module="eczema_photo", dataset="scin", target="t_s", label="severity"), "has no label"),
        (dict(id="bad_study", module="eczema_photo", dataset="scin", target="Bad-Name", label="eczema"), "snake_case"),
    ],
)
def test_invalid_specs_are_rejected(tmp_path, fields, message):
    d = write(tmp_path, "bad_study", BASE.format(**fields))
    with pytest.raises(SpecError, match=message):
        load_spec(d)


def test_unknown_keys_are_rejected(tmp_path):
    d = write(tmp_path, "typo_study", BASE.format(id="typo_study", module="eczema_photo", dataset="scin", target="t_s", label="eczema") + "subgroups: fitzpatrick\n")
    with pytest.raises(SpecError, match="subgroups"):
        load_spec(d)
