"""Ridge-regression heads: a NumPy port of packages/shared/src/models.ts.

The browser wizard and this kit must produce interchangeable models (the web app applies
both with `applyModel`), so standardisation, the unpenalised intercept, the k-fold shuffle
and lambda selection follow the TypeScript exactly. tests/test_ridge.py checks this against
fixtures exported from the TypeScript implementation.

One addition: `group_kfold` keeps every capture of a case in the same fold, so photos of the
same rash never appear in both training and validation folds.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_TRAINING_EXAMPLES = 10
DEFAULT_LAMBDAS = [0.01, 0.1, 1, 10, 100]
_M = 0xFFFFFFFF


@dataclass
class RidgeFit:
    weights: np.ndarray
    intercept: float
    means: np.ndarray
    stds: np.ndarray

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.intercept + ((np.asarray(X, dtype=float) - self.means) / self.stds) @ self.weights


@dataclass
class _Standardised:
    """Sufficient statistics of a training set: everything fit_ridge needs except lambda."""

    means: np.ndarray
    stds: np.ndarray
    gram: np.ndarray  # Z'Z
    zty: np.ndarray  # Z'(y - mean y)
    ym: float


def _standardise(X: np.ndarray, y: np.ndarray) -> _Standardised:
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    n, p = X.shape
    if n == 0 or p == 0:
        raise ValueError("empty training set")
    means = X.mean(axis=0)
    stds = np.sqrt(((X - means) ** 2).mean(axis=0))
    stds = np.where(stds > 1e-12, stds, 1.0)  # constant feature: weight shrinks to 0
    Z = (X - means) / stds
    ym = float(y.mean())
    return _Standardised(means, stds, Z.T @ Z, Z.T @ (y - ym), ym)


def _solve(st: _Standardised, lam: float) -> RidgeFit:
    w = np.linalg.solve(st.gram + lam * np.eye(len(st.zty)), st.zty)
    return RidgeFit(weights=w, intercept=st.ym, means=st.means, stds=st.stds)


def fit_ridge(X: np.ndarray, y: np.ndarray, lam: float) -> RidgeFit:
    """Ridge regression on standardised features; the intercept is not penalised."""
    return _solve(_standardise(X, y), lam)


def _imul(a: int, b: int) -> int:
    return (a * b) & _M


def _rng(seed: int):
    """mulberry32, as in models.ts `kfold`."""
    s = seed & _M

    def rand() -> float:
        nonlocal s
        s = (s + 0x6D2B79F5) & _M
        t = _imul(s ^ (s >> 15), s | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & _M
        return ((t ^ (t >> 14)) & _M) / 4294967296

    return rand


def _shuffled(n: int, seed: int) -> list[int]:
    rand = _rng(seed)
    idx = list(range(n))
    for i in range(n - 1, 0, -1):
        j = int(rand() * (i + 1))
        idx[i], idx[j] = idx[j], idx[i]
    return idx


def kfold(n: int, k: int, seed: int = 42) -> list[list[int]]:
    idx = _shuffled(n, seed)
    return [[v for i, v in enumerate(idx) if i % k == f] for f in range(k)]


def group_kfold(groups: list[str], k: int, seed: int = 42) -> list[list[int]]:
    """k folds over groups (first-appearance order, then shuffled like `kfold`)."""
    order: dict[str, int] = {}
    for g in groups:
        order.setdefault(g, len(order))
    group_folds = kfold(len(order), k, seed)
    fold_of = {}
    for f, members in enumerate(group_folds):
        for gi in members:
            fold_of[gi] = f
    folds: list[list[int]] = [[] for _ in range(k)]
    for i, g in enumerate(groups):
        folds[fold_of[order[g]]].append(i)
    return folds


@dataclass
class CvResult:
    oof: np.ndarray
    metrics: dict[str, float]


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    den = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / den) if den > 0 else 0.0


def _metrics(y: np.ndarray, oof: np.ndarray, baseline: np.ndarray, k: int) -> dict[str, float]:
    err = oof - y
    return {
        "n": int(len(y)),
        "folds": k,
        "mae": float(np.abs(err).mean()),
        "rmse": float(np.sqrt((err**2).mean())),
        "r": _pearson(oof, y),
        "baseline_mae": float(np.abs(baseline - y).mean()),
        "label_min": float(y.min()),
        "label_max": float(y.max()),
    }


def cross_validate_many(X: np.ndarray, y: np.ndarray, lambdas: list[float], folds: list[list[int]]) -> list[CvResult]:
    """Out-of-fold predictions for several lambdas; each fold is standardised once."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    oof = np.empty((len(lambdas), len(y)))
    baseline = np.empty(len(y))
    for test in folds:
        mask = np.ones(len(y), dtype=bool)
        mask[test] = False
        st = _standardise(X[mask], y[mask])
        for li, lam in enumerate(lambdas):
            oof[li, test] = _solve(st, lam).predict(X[test])
        baseline[test] = st.ym
    return [CvResult(oof=oof[li], metrics=_metrics(y, oof[li], baseline, len(folds))) for li in range(len(lambdas))]


def cross_validate(X: np.ndarray, y: np.ndarray, lam: float, folds: list[list[int]]) -> CvResult:
    return cross_validate_many(X, y, [lam], folds)[0]


@dataclass
class TrainedHead:
    fit: RidgeFit
    lam: float
    metrics: dict[str, float]
    oof: np.ndarray
    lambda_scores: list[dict[str, float]]


def train_ridge_cv(
    X: np.ndarray,
    y: np.ndarray,
    lambdas: list[float] | None = None,
    groups: list[str] | None = None,
    k: int = 5,
    select_by: str = "mae",
) -> TrainedHead:
    """Choose lambda by cross-validated error (MAE, as the web wizard does, or RMSE: the
    better choice for probabilities, where MAE rewards always predicting the majority),
    then refit on every example."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(y) < MIN_TRAINING_EXAMPLES:
        raise ValueError(f"need at least {MIN_TRAINING_EXAMPLES} labelled examples (have {len(y)})")
    if not (np.isfinite(X).all() and np.isfinite(y).all()):
        raise ValueError("features and labels must be finite numbers")
    k = min(k, len(y) if groups is None else len(set(groups)))
    folds = kfold(len(y), k) if groups is None else group_kfold(groups, k)
    lambdas = list(lambdas or DEFAULT_LAMBDAS)
    scored = list(zip(lambdas, cross_validate_many(X, y, lambdas, folds)))
    best_lam, best = scored[0]
    if select_by not in ("mae", "rmse"):
        raise ValueError("select_by must be 'mae' or 'rmse'")
    for lam, res in scored[1:]:  # first minimum wins, like Array.reduce with `<`
        if res.metrics[select_by] < best.metrics[select_by]:
            best_lam, best = lam, res
    return TrainedHead(
        fit=fit_ridge(X, y, best_lam),
        lam=best_lam,
        metrics=best.metrics,
        oof=best.oof,
        lambda_scores=[{"lambda": lam, "mae": res.metrics["mae"], "rmse": res.metrics["rmse"]} for lam, res in scored],
    )
