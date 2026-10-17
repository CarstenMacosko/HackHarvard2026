"""Image embeddings for training captures (feature group "embedding"), cached per capture.

Photos are decoded exactly as the module decodes them (eczema.load_photo: longest side at
most 1024 px) before embedding, which is also what the browser does before it embeds.
"""
from __future__ import annotations

import hashlib
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .datasets.base import Example
from .paths import cache_dir


def _path(ex_id: str):
    from app.embedding import EMBEDDER_ID

    return cache_dir("features", EMBEDDER_ID) / (hashlib.sha1(ex_id.encode()).hexdigest() + ".npy")


def _embed(args: tuple[str, str]) -> tuple[str, bool]:
    ex_id, media_path = args
    from app.embedding import FEATURE_NAMES, embed_bgr
    from app.modules.eczema import load_photo

    try:
        vec = embed_bgr(load_photo(media_path))
    except Exception as e:
        print(f"embedding: {media_path}: {e}", file=sys.stderr)
        return ex_id, False
    np.save(_path(ex_id), np.array([vec[n] for n in FEATURE_NAMES], dtype=np.float32))
    return ex_id, True


def embed_all(examples: list[Example], workers: int | None = None) -> dict[str, dict[str, float]]:
    from app.embedding import FEATURE_NAMES

    todo = [(e.id, e.media_path) for e in examples if not _path(e.id).exists()]
    if todo:
        workers = workers or max(1, os.cpu_count() or 2)
        print(f"embedding: {len(todo)} captures ({workers} workers)", file=sys.stderr, flush=True)
        with ProcessPoolExecutor(workers) as pool:
            for i, _ in enumerate(pool.map(_embed, todo, chunksize=8)):
                if (i + 1) % 500 == 0:
                    print(f"embedding: {i + 1}/{len(todo)}", file=sys.stderr, flush=True)
    out: dict[str, dict[str, float]] = {}
    for e in examples:
        p = _path(e.id)
        if p.exists():
            # float32 storage, so values round-trip through float() unchanged in every run
            out[e.id] = dict(zip(FEATURE_NAMES, np.load(p).astype(float).tolist()))
        else:
            out[e.id] = {}
    return out
