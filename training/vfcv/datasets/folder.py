"""Any labelled folder of photos or videos, e.g. data fetched on Adroit or a study's own
consented captures.

    <root>/
      labels.csv      file,<label columns...>[,group][,meta_<key> columns...]
      dataset.yaml    optional: title, licence, url, citation, media_type, label_kinds
      <files referenced by labels.csv, any sub-folders>

`group` keeps captures of one person or case in the same fold (defaults to the file name).
`meta_fitzpatrick` (etc.) become subgroup keys. Empty label cells mean "not labelled".
Use `media_type: video` for videos; landmark tracks (`.npz`) work for the video modules.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path

import yaml

from ..paths import REPO
from .base import DatasetInfo, Example


def _root(path: str) -> Path:
    p = Path(os.path.expandvars(os.path.expanduser(path)))
    return p if p.is_absolute() else REPO / p


def info(path: str | None = None) -> DatasetInfo:
    meta = {}
    if path and (_root(path) / "dataset.yaml").exists():
        meta = yaml.safe_load((_root(path) / "dataset.yaml").read_text()) or {}
    return DatasetInfo(
        name="folder",
        title=meta.get("title", f"Local folder {path}"),
        licence=meta.get("licence", "unspecified: confirm before sharing any model trained on it"),
        url=meta.get("url", ""),
        citation=meta.get("citation", ""),
        media_type=meta.get("media_type", "photo"),
        label_kinds=meta.get("label_kinds", {}),
        notes=meta.get("notes", ""),
    )


def load(path: str, **_: object) -> list[Example]:
    root = _root(path)
    with open(root / "labels.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows or "file" not in rows[0]:
        raise ValueError(f"{root / 'labels.csv'} needs a 'file' column")
    out = []
    for row in rows:
        media = root / row["file"]
        if not media.exists():
            continue
        labels = {}
        for k, v in row.items():
            if k in ("file", "group") or k.startswith("meta_") or v in ("", None):
                continue
            try:
                labels[k] = float(v)
            except ValueError:
                continue  # free-text columns are ignored
        out.append(
            Example(
                id=f"folder:{root.name}:{row['file']}",
                group=row.get("group") or row["file"],
                media_path=str(media),
                labels=labels,
                meta={k[5:]: v for k, v in row.items() if k.startswith("meta_")},
            )
        )
    return out
