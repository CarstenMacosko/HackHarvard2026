"""The kit's ridge heads must match the TypeScript implementation the web app runs."""
import json
from pathlib import Path

import numpy as np
import pytest

from vfcv.ridge import fit_ridge, group_kfold, kfold, train_ridge_cv

TS = json.loads((Path(__file__).parent / "fixtures" / "ridge_ts.json").read_text())


def test_kfold_shuffle_matches_typescript():
    assert kfold(23, 5) == TS["folds_23_5"]
    assert kfold(47, 5, seed=9) == TS["folds_47_5_seed9"]


def test_train_ridge_cv_matches_typescript():
    head = train_ridge_cv(np.array(TS["X"]), np.array(TS["y"]))
    assert head.lam == TS["lambda"]
    np.testing.assert_allclose(head.fit.weights, TS["weights"], rtol=1e-9, atol=1e-12)
    assert head.fit.intercept == pytest.approx(TS["intercept"], rel=1e-12)
    np.testing.assert_allclose(head.fit.means, TS["means"], rtol=1e-12)
    np.testing.assert_allclose(head.fit.stds, TS["stds"], rtol=1e-12)
    np.testing.assert_allclose(head.oof, TS["oof"], rtol=1e-9)
    for key, value in TS["metrics"].items():
        assert head.metrics[key] == pytest.approx(value, rel=1e-9), key
    assert [s["lambda"] for s in head.lambda_scores] == [s["lambda"] for s in TS["lambda_scores"]]


def test_group_kfold_keeps_groups_together():
    groups = [f"case{i // 3}" for i in range(30)]
    folds = group_kfold(groups, 5)
    assert sorted(i for f in folds for i in f) == list(range(30))
    for f in folds:
        cases = {groups[i] for i in f}
        for other in folds:
            if other is not f:
                assert cases.isdisjoint({groups[i] for i in other})


def test_constant_feature_gets_zero_weight():
    rng = np.random.default_rng(0)
    X = np.c_[rng.normal(size=50), np.full(50, 3.0)]
    fit = fit_ridge(X, 2 * X[:, 0] + 1, 0.01)
    assert fit.weights[1] == 0
    assert fit.stds[1] == 1


def test_refuses_tiny_or_non_finite_sets():
    with pytest.raises(ValueError, match="at least 10"):
        train_ridge_cv(np.ones((5, 2)), np.ones(5))
    X = np.ones((12, 2))
    X[0, 0] = np.nan
    with pytest.raises(ValueError, match="finite"):
        train_ridge_cv(X, np.arange(12.0))
