"""General-purpose image embeddings: the first "backbone" feature group (docs/GENERALIZED_CV.md).

MediaPipe's Image Embedder with MobileNet-V3 Small (ImageNet-trained, 1,024 values,
L2-normalised). The same model runs in the browser through @mediapipe/tasks-vision, so study
heads trained on these features run on-device like the hand-designed ones.

Feature names carry the embedder id (`mnv3s_0` … `mnv3s_1023`); a different embedder gets a
different prefix, so a head can never silently read features from the wrong model.
"""
from __future__ import annotations

import os
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np

EMBEDDER_ID = "mnv3s"
EMBEDDER_URL = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite"
DIM = 1024
FEATURE_NAMES = [f"{EMBEDDER_ID}_{i}" for i in range(DIM)]


def embedder_model_path() -> str:
    path = Path(os.environ.get("IMAGE_EMBEDDER_MODEL") or Path(__file__).resolve().parents[1] / "models" / "mobilenet_v3_small.tflite")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(EMBEDDER_URL, tmp)
        tmp.replace(path)
    return str(path)


@lru_cache(maxsize=1)
def _embedder():
    from mediapipe.tasks.python import BaseOptions, vision

    return vision.ImageEmbedder.create_from_options(
        vision.ImageEmbedderOptions(base_options=BaseOptions(model_asset_path=embedder_model_path()), l2_normalize=True, quantize=False)
    )


def available() -> bool:
    try:
        import mediapipe  # noqa: F401
    except ImportError:
        return False
    return True


def embed_bgr(bgr: np.ndarray) -> dict[str, float]:
    """Embedding of a BGR image (as decoded by OpenCV), keyed by feature name."""
    import mediapipe as mp

    rgb = np.ascontiguousarray(bgr[..., ::-1])
    res = _embedder().embed(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    vec = np.asarray(res.embeddings[0].embedding, dtype=float)
    if vec.shape != (DIM,):
        raise ValueError(f"unexpected embedding size {vec.shape}")
    return {name: float(v) for name, v in zip(FEATURE_NAMES, vec)}
