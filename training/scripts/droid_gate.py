"""Check what Droid changed before anything is committed (the workflow's merge gate).

Droid may add a study (training/studies/<slug>/), a dataset loader, a CV module with its tests
and on-device port, and catalog entries. It may not touch CI, API routes, database migrations,
secrets or lockfiles, commit media, or mark a model as validated. Every study it adds must be
either trained (model.json, metrics.json, model_card.md, provenance.source = droid) or
explicitly blocked on data (DATA_NEEDED.md).

    python training/scripts/droid_gate.py          # exit 1 with reasons if the change is not acceptable
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "training"))

FORBIDDEN_PREFIXES = (".github/", "apps/web/app/api/", "supabase/", "services/agent/", "node_modules/", "training/.cache/")
FORBIDDEN_FILES = {"package-lock.json", "package.json", ".env", ".env.local", ".env.example"}
MEDIA = {".mp4", ".mov", ".avi", ".webm", ".jpg", ".jpeg", ".webp", ".heic", ".npz", ".npy", ".pt", ".pth", ".onnx", ".tflite", ".task", ".safetensors"}
ALLOWED_MEDIA_DIRS = ("packages/cv/fixtures/", "services/cv/tests/fixtures/")
MAX_BYTES = 2_000_000


def changed_files() -> list[str]:
    out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=REPO, capture_output=True, text=True, check=True).stdout
    files = []
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip('"')
        if not path.startswith(".droid/"):
            files.append(path)
    return files


def check(files: list[str]) -> tuple[list[str], list[dict]]:
    from vfcv.publish import bundle, OUT
    from vfcv.spec import SpecError, load_spec

    problems: list[str] = []
    for f in files:
        p = REPO / f
        if f.startswith(FORBIDDEN_PREFIXES):
            problems.append(f"{f}: Droid may not change this path")
        elif Path(f).name in FORBIDDEN_FILES:
            problems.append(f"{f}: Droid may not change package manifests, lockfiles or env files")
        if p.suffix.lower() in MEDIA and not f.startswith(ALLOWED_MEDIA_DIRS):
            problems.append(f"{f}: media and model weights stay out of git")
        if p.is_file() and p.stat().st_size > MAX_BYTES:
            problems.append(f"{f}: larger than {MAX_BYTES // 1_000_000} MB")

    studies = sorted({Path(f).parts[2] for f in files if f.startswith("training/studies/") and len(Path(f).parts) > 3})
    results = []
    if not studies:
        problems.append("no study was added or changed under training/studies/")
    for slug in studies:
        d = REPO / "training" / "studies" / slug
        if not (d / "study.yaml").exists():
            problems.append(f"training/studies/{slug}: missing study.yaml")
            continue
        try:
            spec = load_spec(d)
        except SpecError as e:
            problems.append(f"training/studies/{slug}/study.yaml: {e}")
            continue
        trained = (d / "model.json").exists()
        if trained:
            for name in ("metrics.json", "model_card.md"):
                if not (d / name).exists():
                    problems.append(f"training/studies/{slug}: model.json without {name}")
            model = json.loads((d / "model.json").read_text())
            if model.get("status") != "reusable_needs_validation":
                problems.append(f"training/studies/{slug}: a new model must start as reusable_needs_validation")
            if (model.get("provenance") or {}).get("source") != "droid":
                problems.append(f"training/studies/{slug}: model.json was not produced by `python -m vfcv.run ... --source droid`")
            results.append({"study": slug, "outcome": "trained", "name": spec.name, "metrics": model.get("metrics"), "provenance": model.get("provenance")})
        elif (d / "DATA_NEEDED.md").exists():
            results.append({"study": slug, "outcome": "needs_data", "name": spec.name})
        else:
            problems.append(f"training/studies/{slug}: neither trained (model.json) nor blocked on data (DATA_NEEDED.md)")

    current = json.loads(OUT.read_text()) if OUT.exists() else []
    if json.loads(json.dumps(bundle())) != current:
        problems.append("packages/shared/src/pretrained/models.json is stale: run `python -m vfcv.publish` in training/")
    return problems, results


def summary_markdown(problems: list[str], results: list[dict]) -> str:
    lines = ["## Droid study-model gate", ""]
    for r in results:
        if r["outcome"] == "trained":
            m, p = r["metrics"], r["provenance"]
            auc = f", AUC {p['auc']:.3f}" if p.get("auc") is not None else ""
            worst = p.get("worst_subgroup")
            lines.append(
                f"- **{r['name']}** (`{r['study']}`): trained on {p['dataset_title']} ({p['label_kind'].replace('_', ' ')} labels, {p['licence']}). "
                f"n = {m['n']}, MAE {m['mae']:.3f} vs {m['baseline_mae']:.3f} baseline, r {m['r']:.3f}{auc}"
                + (f"; worst subgroup {worst['name']} ({worst['metric']} {worst['value']:.3f})" if worst else "")
            )
        else:
            lines.append(f"- **{r['name']}** (`{r['study']}`): needs data, see `training/studies/{r['study']}/DATA_NEEDED.md`")
    if problems:
        lines += ["", "### Problems", ""] + [f"- {p}" for p in problems]
    else:
        lines += ["", "All gate checks passed."]
    return "\n".join(lines) + "\n"


def main() -> int:
    problems, results = check(changed_files())
    md = summary_markdown(problems, results)
    out = REPO / ".droid"
    out.mkdir(exist_ok=True)
    (out / "gate.md").write_text(md)
    print(md)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        outcome = "needs_data" if results and all(r["outcome"] == "needs_data" for r in results) else "trained"
        with open(gh_out, "a") as f:
            f.write(f"outcome={outcome}\n")
    for p in problems:
        print(f"::error::{p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
