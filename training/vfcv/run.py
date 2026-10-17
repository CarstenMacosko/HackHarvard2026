"""Train one study model end to end.

    python -m vfcv.run studies/<slug>             # train, evaluate, write model.json + card
    python -m vfcv.run studies/<slug> --check     # validate the spec only (fast; used in CI)
    python -m vfcv.run studies/<slug> --limit 200 # quick run on a subset (outputs not written)

Outputs, next to study.yaml:
- model.json      registry model (CvModel), loaded by the web app as a built-in model
- metrics.json    full evaluation, including per-subgroup results
- model_card.md   data, metrics, subgroups, limitations
and refreshes the web app's bundle of built-in models (vfcv.publish).
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter

import numpy as np

from . import datasets, evaluate, export
from .features import measure_all, module_info
from .spec import load_spec


def train(study_dir: str, limit: int | None = None, write: bool = True, source: str = "training_kit") -> dict:
    spec = load_spec(study_dir)
    info = datasets.info(spec.dataset, spec.dataset_options)
    examples = datasets.load(spec.dataset, spec.dataset_options)
    if limit:
        examples = examples[:limit]
    labelled = [e for e in examples if spec.target.source_label in e.labels]
    if not labelled:
        raise SystemExit(f"{spec.id}: no captures carry the label {spec.target.source_label!r}")
    measured = measure_all(spec.module, labelled)

    feature_names = spec.features or module_info(spec.module)["features"]
    if spec.feature_groups:
        from .embedding import embed_all

        emb = embed_all(labelled)
        emb_names = sorted(next(iter(v for v in emb.values() if v), {}).keys(), key=lambda s: int(s.split("_")[1]))
        feature_names = list(feature_names) + emb_names
    else:
        emb = {}

    usable, excluded = [], []
    for e in labelled:
        m = measured[e.id]
        has_features = bool(m.features) and (not emb or emb.get(e.id))
        if has_features and (m.passed or spec.quality == "all"):
            usable.append(e)
        else:
            excluded.append(e)
    if len(usable) < 10:
        raise SystemExit(f"{spec.id}: only {len(usable)} usable captures (need 10)")

    X = np.array([[{**measured[e.id].features, **emb.get(e.id, {})}[f] for f in feature_names] for e in usable], dtype=float)
    y = np.array([e.labels[spec.target.source_label] for e in usable], dtype=float)
    groups = [e.group for e in usable]

    from .ridge import train_ridge_cv

    head = train_ridge_cv(X, y, spec.lambdas, groups, k=spec.folds, select_by=spec.select_by)
    # deployment clamps predictions to the training label range (applyModel), so judge that
    pred = np.clip(head.oof, y.min(), y.max())
    report = {
        "study": spec.id,
        "n_captures": len(usable),
        "n_groups": len(set(groups)),
        "n_labelled": len(labelled),
        "n_excluded_quality": len(excluded),
        "excluded_reasons": dict(Counter(r for e in excluded for r in (measured[e.id].failed or ["missing features"]))),
        "lambda": head.lam,
        "lambda_scores": head.lambda_scores,
        "ridge_metrics": head.metrics,
        "overall": evaluate.summary(y, pred, spec.target.kind),
    }
    if spec.subgroup:
        keys = [e.meta.get(spec.subgroup, "unknown") for e in usable]
        report["subgroups"] = evaluate.subgroups(
            y,
            pred,
            spec.target.kind,
            keys,
            excluded=Counter(e.meta.get(spec.subgroup, "unknown") for e in excluded),
            totals=Counter(e.meta.get(spec.subgroup, "unknown") for e in labelled),
        )
    model = export.model_json(spec, head, list(feature_names), info, report, source)
    if write and not limit:
        export.write(spec, model, report, export.model_card(spec, model, info, report))
        from .publish import publish

        publish()
    return {"model": model, "report": report}


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="python -m vfcv.run")
    ap.add_argument("study", nargs="+", help="study folder(s) containing study.yaml")
    ap.add_argument("--check", action="store_true", help="validate the spec(s) only")
    ap.add_argument("--limit", type=int, help="train on the first N captures without writing outputs")
    ap.add_argument("--source", default="training_kit", choices=["training_kit", "droid"])
    args = ap.parse_args(argv)
    for study in args.study:
        if args.check:
            spec = load_spec(study)
            print(f"ok  {spec.id}: {spec.module} ← {spec.dataset}:{spec.target.source_label}")
            continue
        out = train(study, args.limit, source=args.source)
        r, m = out["report"], out["model"]["metrics"]
        auc = r["overall"].get("auc")
        print(
            f"{r['study']}: n={r['n_captures']} ({r['n_groups']} groups, {r['n_excluded_quality']} excluded) "
            f"MAE {m['mae']:.4f} vs baseline {m['baseline_mae']:.4f}, r {m['r']:.3f}"
            + (f", AUC {auc:.3f}" if auc is not None else "")
            + (f", worst subgroup {r['subgroups']['worst']}" if r.get("subgroups") else ""),
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
