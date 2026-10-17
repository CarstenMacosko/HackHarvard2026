"""Write a trained head as a registry model (CvModel JSON), its metrics and a model card."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .datasets.base import DatasetInfo
from .paths import REPO
from .ridge import TrainedHead
from .spec import StudySpec

KIT_VERSION = "0.1.0"


def _r(x: float | None, nd: int = 6) -> float | None:
    return None if x is None else round(float(x), nd)


def model_json(spec: StudySpec, head: TrainedHead, features: list[str], info: DatasetInfo, report: dict, source: str) -> dict:
    out_dir = spec.path.parent
    previous = out_dir / "model.json"
    m = head.metrics
    model = {
        "id": f"cvm_{spec.id}",
        "name": spec.name,
        "description": spec.description,
        "study_id": spec.study_id,
        "module": spec.module,
        "target": {"name": spec.target.name, "label": spec.target.label, "unit": spec.target.unit},
        "kind": "ridge",
        "features": features,
        "weights": [_r(w, 10) for w in head.fit.weights],
        "intercept": _r(head.fit.intercept, 10),
        "feature_means": [_r(v, 10) for v in head.fit.means],
        "feature_stds": [_r(v, 10) for v in head.fit.stds],
        "lambda": head.lam,
        "metrics": {
            "n": int(m["n"]),
            "folds": int(m["folds"]),
            "mae": _r(m["mae"]),
            "rmse": _r(m["rmse"]),
            "r": _r(m["r"]),
            "baseline_mae": _r(m["baseline_mae"]),
            "label_min": _r(m["label_min"]),
            "label_max": _r(m["label_max"]),
        },
        "status": "reusable_needs_validation",
        "active": True,
        "version": 1,
        "created_by": "Droid (training kit)" if source == "droid" else "Training kit",
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "provenance": {
            "source": source,
            "dataset": info.name,
            "dataset_title": info.title,
            "licence": info.licence,
            "url": info.url,
            "citation": info.citation,
            "label_kind": info.label_kinds.get(spec.target.source_label, "researcher"),
            "n_cases": report["n_groups"],
            "n_excluded_quality": report["n_excluded_quality"],
            "auc": _r(report["overall"].get("auc"), 4),
            "worst_subgroup": report["subgroups"]["worst"] if report.get("subgroups") else None,
            "card_path": str((out_dir / "model_card.md").relative_to(REPO)),
            "spec_path": str(spec.path.relative_to(REPO)),
            "kit_version": KIT_VERSION,
        },
    }
    if previous.exists():
        old = json.loads(previous.read_text())
        same = all(old.get(k) == model[k] for k in ("features", "weights", "intercept", "feature_means", "feature_stds", "lambda"))
        model["version"] = old.get("version", 1) if same else old.get("version", 1) + 1
        if same:
            model["created_at"] = old.get("created_at", model["created_at"])
    return model


def _fmt(v, nd=3) -> str:
    if v is None:
        return "–"
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def model_card(spec: StudySpec, model: dict, info: DatasetInfo, report: dict) -> str:
    m = model["metrics"]
    p = model["provenance"]
    lines = [
        f"# Model card: {spec.name}",
        "",
        f"`{model['id']}` v{model['version']} · module `{spec.module}` · target `{spec.target.name}` ({spec.target.unit}) · "
        f"status **needs validation** · trained {model['created_at'][:10]} by {model['created_by']}",
        "",
        "## Intended use",
        "",
        spec.intended_use.strip() or spec.description,
        "",
        "Every prediction goes to clinician review before it enters a participant's record. "
        "This model is not clinically validated and must not be used for diagnosis.",
        "",
        "## Data",
        "",
        f"- **Dataset:** [{info.title}]({info.url})" if info.url else f"- **Dataset:** {info.title}",
        f"- **Licence:** {info.licence}",
    ]
    if info.citation:
        lines.append(f"- **Citation:** {info.citation}")
    lines += [
        f"- **Label:** `{spec.target.source_label}` ({p['label_kind'].replace('_', ' ')}), as `{spec.target.kind}`",
        f"- **Captures used:** {m['n']} from {report['n_groups']} cases/people; "
        f"{report['n_excluded_quality']} more failed the module's quality gate and were excluded"
        + (" (training used every capture)" if spec.quality == "all" else ""),
    ]
    if info.notes:
        lines.append(f"- **Notes:** {info.notes}")
    lines += [
        "",
        "## Performance (out-of-fold, grouped by case)",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| MAE | {_fmt(m['mae'])} (predicting the mean: {_fmt(m['baseline_mae'])}) |",
        f"| RMSE | {_fmt(m['rmse'])} |",
        f"| Pearson r | {_fmt(m['r'])} |",
    ]
    if report["overall"].get("auc") is not None:
        lines.append(f"| AUC (label ≥ 0.5, {report['overall']['n_positive']} positives) | {_fmt(report['overall']['auc'])} |")
    lines += [f"| Folds / ridge λ | {m['folds']} / {model['lambda']} |", ""]
    sub = report.get("subgroups")
    if sub:
        lines += [
            f"### By {spec.subgroup}",
            "",
            "| Group | n | MAE | r | AUC | Excluded by quality gate |",
            "|---|---|---|---|---|---|",
        ]
        for name, row in sub["groups"].items():
            excl = f"{row['excluded_by_quality']}" + (f" ({row['exclusion_rate'] * 100:.0f}%)" if row.get("exclusion_rate") is not None else "")
            lines.append(f"| {name} | {row['n']} | {_fmt(row.get('mae'))} | {_fmt(row.get('r'))} | {_fmt(row.get('auc'))} | {excl} |")
        w = sub["worst"]
        if w:
            lines += ["", f"Worst subgroup (n ≥ 20): **{w['name']}**, {w['metric'].upper()} {_fmt(w['value'])}."]
        lines.append("")
    lines += ["## Limitations", ""]
    lines += [f"- {x}" for x in spec.limitations] or ["- None recorded."]
    lines += [
        "",
        "## Reproduce",
        "",
        "```bash",
        f"python -m vfcv.run {p['spec_path'].removeprefix('training/')}",
        "```",
        "",
        f"Inputs: the {len(model['features'])} features of `{spec.module}`"
        + (f" plus {', '.join(spec.feature_groups)}" if spec.feature_groups else "")
        + f". Training kit v{KIT_VERSION}.",
        "",
    ]
    return "\n".join(lines)


def write(spec: StudySpec, model: dict, report: dict, card: str) -> Path:
    out = spec.path.parent
    (out / "model.json").write_text(json.dumps(model, indent=1) + "\n")
    (out / "metrics.json").write_text(json.dumps(report, indent=1, default=float) + "\n")
    (out / "model_card.md").write_text(card)
    return out
