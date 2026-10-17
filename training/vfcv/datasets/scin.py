"""SCIN: Skin Condition Image Network (Google Research + Stanford Medicine, 2024).

5,033 crowdsourced cases (10,407 photos) from US internet users. Each case is labelled by
1-3 dermatologists with a weighted differential diagnosis and a Fitzpatrick skin type, and
carries the contributor's own answers (texture, symptoms, body part, self-reported FST).
Public bucket: gs://dx-scin-public-data. Licence: SCIN Data Use License (attribution; no
re-identification). https://github.com/google-research-datasets/scin

Labels this loader exposes (all per case, so every photo of a case shares them):
- eczema, psoriasis, ...: the dermatologists' weighted probability of that condition (0-1)
- rough_or_flaky: 1 if the contributor described the skin as rough or flaky (a self-reported
  proxy for scaling), 0 if they described its texture otherwise; missing if no texture given
- itching: 1 if the contributor reported itching, 0 otherwise
- gradable: 1 if dermatologists judged the photos good enough to grade (needs
  `include_ungradable: true`; only gradable cases carry condition labels)

There are no severity grades (EASI, PASI, SCORAD) in SCIN. Models trained on it estimate how
much a photo looks like a condition, not how severe the condition is.
"""
from __future__ import annotations

import ast
import csv
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

from ..paths import cache_dir
from .base import DatasetInfo, Example

BUCKET = "https://storage.googleapis.com/dx-scin-public-data/dataset"
CSV_FILES = ["scin_cases.csv", "scin_labels.csv"]
TEXTURES = ["textures_raised_or_bumpy", "textures_flat", "textures_rough_or_flaky", "textures_fluid_filled"]
CONDITION_LABELS = {
    # label name used in study specs -> dermatologist label in SCIN
    "eczema": "Eczema",
    "psoriasis": "Psoriasis",
    "allergic_contact_dermatitis": "Allergic Contact Dermatitis",
    "urticaria": "Urticaria",
    "tinea": "Tinea",
}
MAX_SIDE = 1024  # the eczema module resizes to this before measuring, so nothing is lost

INFO = DatasetInfo(
    name="scin",
    title="SCIN: Skin Condition Image Network",
    licence="SCIN Data Use License (attribution required; re-identification prohibited)",
    url="https://github.com/google-research-datasets/scin",
    citation="Ward A, et al. Creating an Empirical Dermatology Dataset Through Crowdsourcing With Web Search Advertisements. JAMA Netw Open. 2024;7(11):e2446615.",
    media_type="photo",
    label_kinds={**{k: "expert" for k in CONDITION_LABELS}, "gradable": "expert", "rough_or_flaky": "self_report", "itching": "self_report"},
    notes="Crowdsourced smartphone photos; dermatologist differential diagnoses; no severity grades.",
)


def root() -> Path:
    return cache_dir("scin")


def _fetch(url: str, dest: Path, attempts: int = 4) -> None:
    for i in range(attempts):
        try:
            tmp = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
                f.write(r.read())
            tmp.replace(dest)
            return
        except Exception as e:
            if i == attempts - 1 or (isinstance(e, urllib.error.HTTPError) and e.code == 404):
                raise
            time.sleep(2 ** (i + 1))


def ensure_csvs() -> None:
    for name in CSV_FILES:
        dest = root() / name
        if not dest.exists():
            _fetch(f"{BUCKET}/{name}", dest)


def _image_dest(image_path: str) -> Path:
    # stored losslessly as WebP (about half the size of the source PNG)
    return cache_dir("scin", "images") / (Path(image_path).stem + ".webp")


def _missing_marker(image_path: str) -> Path:
    return cache_dir("scin", "missing") / Path(image_path).stem


def _download_image(image_path: str) -> Path | None:
    dest = _image_dest(image_path)
    if dest.exists():
        return dest
    if _missing_marker(image_path).exists():
        return None
    raw = cache_dir("scin", "tmp") / Path(image_path).name
    try:
        _fetch(f"{BUCKET}/images/{Path(image_path).name}", raw)
    except urllib.error.HTTPError as e:  # SCIN documents one missing file
        if e.code == 404:
            _missing_marker(image_path).touch()
        print(f"scin: could not download {image_path}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"scin: could not download {image_path}: {e}", file=sys.stderr)
        return None
    img = cv2.imread(str(raw), cv2.IMREAD_COLOR)
    raw.unlink(missing_ok=True)
    if img is None:
        return None
    h, w = img.shape[:2]
    s = MAX_SIDE / max(h, w)
    if s < 1:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    tmp = dest.with_suffix(".part.webp")
    cv2.imwrite(str(tmp), img, [cv2.IMWRITE_WEBP_QUALITY, 101])  # >100 = lossless
    tmp.replace(dest)
    return dest


def _read(name: str) -> list[dict[str, str]]:
    with open(root() / name, newline="") as f:
        return list(csv.DictReader(f))


def _fst(label_row: dict[str, str], case_row: dict[str, str]) -> str:
    """Dermatologist-estimated Fitzpatrick type when available, else self-reported."""
    for v in (label_row.get("dermatologist_fitzpatrick_skin_type_label_1", ""), case_row.get("fitzpatrick_skin_type", "")):
        if v.startswith("FST"):
            return v
    return "unknown"


def is_gradable(label_row: dict[str, str]) -> bool:
    return label_row["dermatologist_gradable_for_skin_condition_1"].startswith(("DEFAULT_YES", "YES"))


def case_labels(label_row: dict[str, str], case_row: dict[str, str]) -> dict[str, float]:
    labels: dict[str, float] = {"gradable": 1.0 if is_gradable(label_row) else 0.0}
    if labels["gradable"]:  # ungradable cases have no diagnosis: leave those labels missing
        weights = ast.literal_eval(label_row["weighted_skin_condition_label"] or "{}")
        labels.update({name: float(weights.get(scin_name, 0.0)) for name, scin_name in CONDITION_LABELS.items()})
    if any(case_row.get(t) == "YES" for t in TEXTURES):
        labels["rough_or_flaky"] = 1.0 if case_row.get("textures_rough_or_flaky") == "YES" else 0.0
    labels["itching"] = 1.0 if case_row.get("condition_symptoms_itching") == "YES" else 0.0
    return labels


def cases(include_ungradable: bool = False) -> list[tuple[dict[str, str], dict[str, str]]]:
    """(labels row, case row) pairs; by default only cases dermatologists could grade."""
    ensure_csvs()
    by_id = {r["case_id"]: r for r in _read("scin_cases.csv")}
    return [
        (lab, by_id[lab["case_id"]])
        for lab in _read("scin_labels.csv")
        if lab["case_id"] in by_id and (include_ungradable or is_gradable(lab))
    ]


def download(limit: int | None = None, workers: int = 16, include_ungradable: bool = False) -> int:
    """Fetch every photo of the selected cases into the cache. Idempotent."""
    paths = [c[k] for _, c in cases(include_ungradable)[:limit] for k in ("image_1_path", "image_2_path", "image_3_path") if c[k]]
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        for i, p in enumerate(pool.map(_download_image, paths)):
            done += p is not None
            if (i + 1) % 250 == 0:
                print(f"scin: {i + 1}/{len(paths)} photos", flush=True)
    return done


def load(limit: int | None = None, download_missing: bool = True, include_ungradable: bool = False) -> list[Example]:
    out: list[Example] = []
    for lab, case in cases(include_ungradable)[:limit]:
        labels = case_labels(lab, case)
        meta = {"fitzpatrick": _fst(lab, case), "shot_type": "", "case_id": case["case_id"]}
        for k in ("1", "2", "3"):
            image_path = case[f"image_{k}_path"]
            if not image_path:
                continue
            dest = _image_dest(image_path)
            if not dest.exists():
                if not download_missing or _download_image(image_path) is None:
                    continue
            out.append(
                Example(
                    id=f"scin:{Path(image_path).stem}",
                    group=case["case_id"],
                    media_path=str(dest),
                    labels=labels,
                    meta={**meta, "shot_type": case.get(f"image_{k}_shot_type", "")},
                )
            )
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    n = download(int(args[0]) if args else None, include_ungradable="--all" in sys.argv)
    print(f"scin: {n} photos cached in {root() / 'images'}")
