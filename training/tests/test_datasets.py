import numpy as np
import pytest

from vfcv.datasets import scin, synthetic
from vfcv.datasets.folder import load as load_folder


def label_row(gradable=True, weights="{'Eczema': 0.41, 'Psoriasis': 0.18}", fst="FST3"):
    return {
        "dermatologist_gradable_for_skin_condition_1": "DEFAULT_YES_IMAGE_QUALITY_SUFFICIENT" if gradable else "NO_IMAGE_QUALITY_INSUFFICIENT",
        "weighted_skin_condition_label": weights if gradable else "{}",
        "dermatologist_fitzpatrick_skin_type_label_1": fst,
    }


def test_scin_labels_from_a_gradable_case():
    case = {"textures_rough_or_flaky": "YES", "textures_flat": "", "condition_symptoms_itching": "YES", "fitzpatrick_skin_type": "FST2"}
    labels = scin.case_labels(label_row(), case)
    assert labels["eczema"] == pytest.approx(0.41)
    assert labels["psoriasis"] == pytest.approx(0.18)
    assert labels["urticaria"] == 0
    assert labels["rough_or_flaky"] == 1 and labels["itching"] == 1 and labels["gradable"] == 1
    assert scin._fst(label_row(), case) == "FST3"  # dermatologist estimate wins over self-report


def test_scin_ungradable_cases_carry_no_diagnosis():
    labels = scin.case_labels(label_row(gradable=False), {"textures_flat": "YES"})
    assert labels["gradable"] == 0
    assert "eczema" not in labels
    assert labels["rough_or_flaky"] == 0  # texture described, but not rough/flaky


def test_scin_texture_label_missing_when_not_described():
    assert "rough_or_flaky" not in scin.case_labels(label_row(), {})
    assert scin._fst(label_row(fst=""), {"fitzpatrick_skin_type": ""}) == "unknown"


@pytest.mark.parametrize(
    "kw, score",
    [
        (dict(rate_hz=4.0, amplitude=1.0, decrement=0.0, onset=1.0, hesitations=0, freeze_s=0.0), 0),
        (dict(rate_hz=4.0, amplitude=1.0, decrement=0.0, onset=1.0, hesitations=2, freeze_s=0.0), 1),
        (dict(rate_hz=2.0, amplitude=1.0, decrement=0.0, onset=1.0, hesitations=0, freeze_s=0.0), 2),
        (dict(rate_hz=4.0, amplitude=1.0, decrement=0.5, onset=0.1, hesitations=0, freeze_s=0.0), 3),
        (dict(rate_hz=4.0, amplitude=1.0, decrement=0.0, onset=1.0, hesitations=0, freeze_s=1.5), 3),
        (dict(rate_hz=4.0, amplitude=0.2, decrement=0.0, onset=1.0, hesitations=0, freeze_s=0.0), 4),
    ],
)
def test_tapping_rule_follows_the_scale_anchors(kw, score):
    assert synthetic.updrs_3_4(**kw) == score


@pytest.mark.parametrize("cm, score", [(0.0, 0), (0.8, 1), (1.0, 1), (2.0, 2), (3.0, 3), (9.9, 3), (10.0, 4)])
def test_tremor_amplitude_bands(cm, score):
    assert synthetic.updrs_3_17(cm) == score


def test_synthetic_generators_are_deterministic_and_cached(tmp_path, monkeypatch):
    monkeypatch.setattr("vfcv.paths.CACHE", tmp_path)
    a = synthetic.load_tremor(n=5, seed=3)
    b = synthetic.load_tremor(n=5, seed=3)
    assert [e.labels for e in a] == [e.labels for e in b]
    assert all(e.media_path.endswith(".npz") for e in a)
    with np.load(a[0].media_path) as d:
        assert d["landmarks"].shape[1:] == (21, 2)
    taps = synthetic.load_tapping(n=5, seed=3)
    assert {e.group for e in taps} == {f"tap3_{i}" for i in range(5)}


def test_folder_loader(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "b.jpg").write_bytes(b"x")
    (tmp_path / "labels.csv").write_text("file,grade,group,meta_fitzpatrick,notes\na.jpg,2,p1,FST4,ok\nb.jpg,,p2,FST1,\nmissing.jpg,1,p3,,\n")
    ex = load_folder(str(tmp_path))
    assert [e.media_path.endswith(n) for e, n in zip(ex, ["a.jpg", "b.jpg"])] == [True, True]
    assert ex[0].labels == {"grade": 2.0} and ex[0].group == "p1" and ex[0].meta == {"fitzpatrick": "FST4"}
    assert ex[1].labels == {}  # empty cell = not labelled


def test_fitzpatrick17k_labels():
    from vfcv.datasets import fitzpatrick17k as f

    assert f.labels_for("pustular psoriasis")["psoriasis"] == 1
    assert f.labels_for("neurodermatitis")["eczema"] == 1
    assert sum(f.labels_for("acne").values()) == 0
    assert f.fitzpatrick({"fitzpatrick_scale": "4"}) == "FST4"
    assert f.fitzpatrick({"fitzpatrick_scale": "-1"}) == "unknown"
