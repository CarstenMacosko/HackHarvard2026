"""Fitzpatrick17k (Groh et al., 2021): 16,577 clinical atlas images of 114 skin conditions,
each with a Fitzpatrick skin type annotation. Licence: CC BY-NC-SA 3.0 (non-commercial).
https://github.com/mattgroh/fitzpatrick17k

The annotations CSV is on GitHub. The images are fetched from their original atlas URLs
(DermaAmin, Atlas Dermatologico); some links are broken, and the authors share a full archive
on request (form in their README). Unpack such an archive into the cache's `images/` folder
named `<md5hash>.jpg` and this loader uses it without downloading.

The atlas hosts are not reachable from every network (e.g. this project's cloud sandbox):
run the download on a machine that can reach them, such as the Adroit login node
(adroit/fetch_datasets.sh).

Labels (per image):
- psoriasis, eczema, ...: 1 if the atlas diagnosis is that condition (or a listed subtype), else 0
- the `fitzpatrick` meta key is the annotators' skin type (1-6), "unknown" if they could not tell

Atlas photos are curated teaching images, not smartphone captures, and 3% or more of labels
have been reported wrong (Abhishek et al., 2024): evaluate on smartphone data before relying on
a model trained here.
"""
from __future__ import annotations

import csv
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2

from ..paths import cache_dir
from .base import DatasetInfo, Example

CSV_URL = "https://raw.githubusercontent.com/mattgroh/fitzpatrick17k/main/fitzpatrick17k.csv"
CONDITIONS = {
    # label name -> atlas labels counted as that condition
    "psoriasis": {"psoriasis", "pustular psoriasis"},
    "eczema": {"eczema", "dyshidrotic eczema", "neurodermatitis"},
    "allergic_contact_dermatitis": {"allergic contact dermatitis"},
    "seborrheic_dermatitis": {"seborrheic dermatitis"},
    "lichen_planus": {"lichen planus"},
}
WRONG_LABEL_QC = "3 Wrongly labelled"
MAX_SIDE = 1024

INFO = DatasetInfo(
    name="fitzpatrick17k",
    title="Fitzpatrick17k: dermatology atlas images with skin-type labels",
    licence="CC BY-NC-SA 3.0 (non-commercial; share-alike)",
    url="https://github.com/mattgroh/fitzpatrick17k",
    citation="Groh M, et al. Evaluating Deep Neural Networks Trained on Clinical Images in Dermatology with the Fitzpatrick 17k Dataset. CVPR Workshops, 2021.",
    media_type="photo",
    label_kinds={k: "expert" for k in CONDITIONS},
    notes="Curated atlas photos (not smartphone captures); atlas diagnoses; some labels are known to be wrong.",
)


def root() -> Path:
    return cache_dir("fitzpatrick17k")


def ensure_csv() -> Path:
    path = root() / "fitzpatrick17k.csv"
    if not path.exists():
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(CSV_URL, tmp)
        tmp.replace(path)
    return path


def rows() -> list[dict[str, str]]:
    with open(ensure_csv(), newline="") as f:
        return [r for r in csv.DictReader(f) if r["qc"] != WRONG_LABEL_QC]


def labels_for(atlas_label: str) -> dict[str, float]:
    return {name: 1.0 if atlas_label in members else 0.0 for name, members in CONDITIONS.items()}


def fitzpatrick(row: dict[str, str]) -> str:
    v = row.get("fitzpatrick_scale", "")
    return f"FST{v}" if v in {"1", "2", "3", "4", "5", "6"} else "unknown"


def _dest(md5: str) -> Path:
    return cache_dir("fitzpatrick17k", "images") / f"{md5}.jpg"


def _download(row: dict[str, str]) -> Path | None:
    dest = _dest(row["md5hash"])
    if dest.exists():
        return dest
    if not row["url"]:
        return None
    try:
        req = urllib.request.Request(row["url"], headers={"User-Agent": "Mozilla/5.0 (research dataset download)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"fitzpatrick17k: {row['url']}: {e}", file=sys.stderr)
        return None
    tmp = dest.with_suffix(".part.jpg")
    tmp.write_bytes(data)
    img = cv2.imread(str(tmp), cv2.IMREAD_COLOR)
    if img is None:
        tmp.unlink(missing_ok=True)
        return None
    h, w = img.shape[:2]
    s = MAX_SIDE / max(h, w)
    if s < 1:
        cv2.imwrite(str(tmp), cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 95])
    tmp.replace(dest)
    return dest


def download(limit: int | None = None, workers: int = 16) -> int:
    todo = rows()[:limit]
    done = 0
    with ThreadPoolExecutor(workers) as pool:
        for i, p in enumerate(pool.map(_download, todo)):
            done += p is not None
            if (i + 1) % 500 == 0:
                print(f"fitzpatrick17k: {i + 1}/{len(todo)} images ({done} ok)", flush=True)
    return done


def load(limit: int | None = None, download_missing: bool = False) -> list[Example]:
    """Images already in the cache (run `python -m vfcv.datasets.fitzpatrick17k` first)."""
    out = []
    for row in rows()[:limit]:
        dest = _dest(row["md5hash"])
        if not dest.exists() and not (download_missing and _download(row)):
            continue
        out.append(
            Example(
                id=f"fitzpatrick17k:{row['md5hash']}",
                group=row["md5hash"],  # one image per entry; near-duplicates are a known issue
                media_path=str(dest),
                labels=labels_for(row["label"]),
                meta={"fitzpatrick": fitzpatrick(row), "atlas_label": row["label"]},
            )
        )
    return out


if __name__ == "__main__":
    n = download(int(sys.argv[1]) if len(sys.argv) > 1 else None)
    print(f"fitzpatrick17k: {n} images cached in {root() / 'images'}")
