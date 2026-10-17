"""Metrics beyond MAE: discrimination for binary targets and per-subgroup performance.

Subgroup reporting is a release requirement (docs/GENERALIZED_CV.md, section 7): a model is
only as good as its worst subgroup, and colour-based skin features are known to vary with
skin tone.
"""
from __future__ import annotations

import numpy as np

MIN_SUBGROUP = 20  # smaller subgroups are listed but not ranked


def auc(scores: np.ndarray, positive: np.ndarray) -> float | None:
    """Area under the ROC curve (Mann-Whitney U, ties counted as half)."""
    scores = np.asarray(scores, dtype=float)
    positive = np.asarray(positive, dtype=bool)
    n_pos, n_neg = int(positive.sum()), int((~positive).sum())
    if n_pos == 0 or n_neg == 0:
        return None
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores))
    sorted_scores = scores[order]
    i = 0
    while i < len(scores):  # average ranks over ties
        j = i
        while j + 1 < len(scores) and sorted_scores[j + 1] == sorted_scores[i]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return float((ranks[positive].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def positives(y: np.ndarray, kind: str) -> np.ndarray | None:
    """Binary view of the target for discrimination metrics (probability: >= 0.5)."""
    if kind == "binary":
        return np.asarray(y) >= 0.5
    if kind == "probability":
        return np.asarray(y) >= 0.5
    return None


def _pearson(a: np.ndarray, b: np.ndarray) -> float | None:
    if len(a) < 3 or np.std(a) == 0 or np.std(b) == 0:
        return None
    return float(np.corrcoef(a, b)[0, 1])


def summary(y: np.ndarray, pred: np.ndarray, kind: str) -> dict:
    y = np.asarray(y, dtype=float)
    pred = np.asarray(pred, dtype=float)
    out = {"n": int(len(y)), "mae": float(np.abs(pred - y).mean()), "r": _pearson(pred, y)}
    pos = positives(y, kind)
    if pos is not None:
        out["n_positive"] = int(pos.sum())
        out["auc"] = auc(pred, pos)
    return out


def subgroups(y: np.ndarray, pred: np.ndarray, kind: str, keys: list[str], excluded: dict[str, int], totals: dict[str, int]) -> dict:
    """Metrics for each subgroup value, plus how many captures the quality gate excluded."""
    keys_arr = np.asarray(keys)
    rows = {}
    for value in sorted(set(keys) | set(totals)):
        mask = keys_arr == value
        row = summary(y[mask], pred[mask], kind) if mask.any() else {"n": 0}
        row["excluded_by_quality"] = excluded.get(value, 0)
        row["exclusion_rate"] = round(excluded.get(value, 0) / totals[value], 4) if totals.get(value) else None
        rows[value] = row
    ranked = {k: v for k, v in rows.items() if v["n"] >= MIN_SUBGROUP and k != "unknown"}
    worst = None
    if ranked:
        if kind in ("binary", "probability") and all(v.get("auc") is not None for v in ranked.values()):
            name = min(ranked, key=lambda k: ranked[k]["auc"])
            worst = {"name": name, "metric": "auc", "value": ranked[name]["auc"], "n": ranked[name]["n"]}
        else:
            name = max(ranked, key=lambda k: ranked[k]["mae"])
            worst = {"name": name, "metric": "mae", "value": ranked[name]["mae"], "n": ranked[name]["n"]}
    return {"groups": rows, "worst": worst}
