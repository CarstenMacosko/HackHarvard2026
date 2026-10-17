"""Bundle every trained study model for the web app.

Writes packages/shared/src/pretrained/models.json: each study's model.json plus its
evaluation summary and model card. The web app loads these as built-in models
(`@vf/shared/pretrained`), and packages/shared/src/pretrained.test.ts fails if the bundle is
out of date with training/studies/*/model.json.

    python -m vfcv.publish
"""
from __future__ import annotations

import json

from .paths import REPO, STUDIES

OUT = REPO / "packages" / "shared" / "src" / "pretrained" / "models.json"
EVALUATION_KEYS = ("n_captures", "n_groups", "n_labelled", "n_excluded_quality", "excluded_reasons", "overall", "subgroups")


def bundle() -> list[dict]:
    entries = []
    for model_path in sorted(STUDIES.glob("*/model.json")):
        study = model_path.parent
        metrics = json.loads((study / "metrics.json").read_text())
        entries.append(
            {
                "study": study.name,
                "model": json.loads(model_path.read_text()),
                "evaluation": {k: metrics[k] for k in EVALUATION_KEYS if k in metrics},
                "card": (study / "model_card.md").read_text(),
            }
        )
    return entries


def publish() -> int:
    entries = bundle()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, indent=1) + "\n")
    return len(entries)


if __name__ == "__main__":
    print(f"published {publish()} models to {OUT.relative_to(REPO)}")
