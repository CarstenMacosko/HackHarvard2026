# Training kit: a study-specific CV model from one spec file

The kit turns a short study spec into a trained, evaluated, documented model that the web app runs on every new capture, on-device and on the server. It is also what Factory Droid uses when a researcher asks for a new model from the workflow builder ([`docs/DROID.md`](../docs/DROID.md)).

```
study.yaml ──► dataset loader ──► the product's own CV module ──► features (+ image embedding)
   │              (SCIN, folder,      prepare → quality gate → measure,      │
   │               synthetic…)        exactly as for a participant upload    ▼
   │                                                          ridge head, grouped k-fold CV
   ▼                                                                         │
model_card.md ◄── metrics.json (overall + per subgroup) ◄────────────────────┤
model.json (CvModel) ──► packages/shared/src/pretrained/models.json ──► web app model registry
```

- **Same code as production.** Captures are measured by `services/cv` modules, so training features are exactly what the app computes. Photo embeddings come from the same MobileNet-V3 model the browser runs.
- **Same model format.** Heads are ridge regressions, a NumPy port of the browser wizard's TypeScript (`tests/test_ridge.py` checks them against each other), so a model trained here is applied by the same `applyModel` code.
- **Honest evaluation.**
  - Folds are grouped by case/person.
  - Predictions are clamped to the training label range, as in deployment.
  - Results are reported per subgroup (e.g. Fitzpatrick skin type), together with how many captures the quality gate excluded.
  - Every model starts as *needs validation*.

## Quick start

```bash
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r training/requirements.txt          # CV service deps + MediaPipe + PyYAML
cd training
python -m vfcv.run studies/* --check              # validate every spec (seconds)
python -m vfcv.run studies/tremor_updrs_synthetic # train one study (synthetic data, ~10 s)
python -m vfcv.run studies/eczema_likelihood_scin # downloads SCIN (~6,500 photos, 3.7 GB) on first run
python -m pytest -q
```

On Linux, MediaPipe needs `libegl1` and `libgles2`. Downloads and computed features are cached in `training/.cache/` (git-ignored; override with `VFCV_CACHE`).

## Writing a study spec

`studies/<id>/study.yaml`:

```yaml
id: scaling_scin                 # snake_case, same as the folder
name: Rough or flaky skin (SCIN, self-reported)
description: One sentence shown in the registry.
condition: psoriasis
module: eczema_photo             # which CV module measures the captures
dataset: scin                    # a loader in vfcv/datasets/ (see DATASETS.md)
dataset_options: {}              # passed to the loader, e.g. {path: data/my_study} for `folder`
target:
  name: scaling_likelihood       # measurement name in the app
  label: Rough or flaky skin
  unit: probability
  source_label: rough_or_flaky   # label key the dataset provides
  kind: binary                   # probability | binary | score
feature_groups: [embedding]      # optional: add the 1,024-value image embedding (photos)
features: [erythema_index, ...]  # optional: subset of the module's features (default: all)
quality: passed                  # train on captures that pass the quality gate (default), or `all`
subgroup: fitzpatrick            # report metrics per value of this metadata key
lambdas: [1000, 3000, 10000]     # ridge penalties to try (default 0.01-100)
select_by: rmse                  # choose λ by mae (default, like the wizard) or rmse (better for probabilities)
folds: 5
study_id: null                   # restrict to one study, or null for every study using the module
intended_use: >
  What the model is for, and what it is not for.
limitations:
  - What the label really is, and known failure modes.
```

`python -m vfcv.run studies/<id>` writes `model.json`, `metrics.json` and `model_card.md` next to the spec and refreshes the web app's bundle (`python -m vfcv.publish`). The model appears in the registry on the next deploy.

## The models in this repo

| Study | Data | Label | Result (out-of-fold, grouped CV) |
|---|---|---|---|
| `eczema_likelihood_scin` | 5,190 SCIN photos (2,730 cases) | dermatologists' weighted eczema probability | AUC 0.64; worst: Fitzpatrick VI, AUC 0.34 (n = 51) |
| `psoriasis_likelihood_scin` | 5,190 SCIN photos | dermatologists' weighted psoriasis probability | AUC 0.62 (few positives) |
| `scaling_scin` | 4,396 SCIN photos | self-reported rough/flaky skin | AUC 0.58 |
| `tapping_updrs_synthetic` | 800 synthetic landmark tracks | MDS-UPDRS 3.4 anchors applied to ground truth | MAE 0.57 vs 0.77 baseline, r 0.63 |
| `tremor_updrs_synthetic` | 800 synthetic landmark tracks | MDS-UPDRS 3.17 amplitude bands applied to ground truth | MAE 0.29 vs 0.82 baseline, r 0.91 |

`psoriasis_fitzpatrick17k` has a spec but no model yet: its images must be fetched on Adroit. Read each `model_card.md` before using a model. The SCIN models estimate how much a photo *looks like* a condition, not its severity. The movement models are trained on synthetic data and show the pipeline end to end, not agreement with clinicians.

## Quality-gate calibration

`python -m vfcv.calibrate <module> <dataset> --label <usable-label>` measures how well each quality check separates usable from unusable captures and suggests thresholds. Run on SCIN's dermatologist gradability labels, it showed that the skin-photo blur threshold (80) rejected two thirds of photos dermatologists could grade. The threshold is now 15 ([`calibration/eczema_photo_scin.md`](calibration/eczema_photo_scin.md)).

## Big datasets and GPUs

Use Princeton Adroit for datasets this machine can't reach or hold (e.g. Fitzpatrick17k's source images) and for fine-tuning: [`adroit/README.md`](../adroit/README.md).

## Layout

```
vfcv/
  spec.py        study.yaml schema and validation
  datasets/      loaders: scin, folder, synthetic (tapping, tremor)
  features.py    measure captures with services/cv modules (cached per module version + gate)
  embedding.py   image embeddings for the `embedding` feature group (cached)
  ridge.py       ridge heads + grouped k-fold CV (port of packages/shared/src/models.ts)
  evaluate.py    AUC, subgroup metrics
  export.py      model.json (CvModel), metrics.json, model_card.md
  publish.py     bundle every model for the web app
  calibrate.py   quality-gate calibration against usability labels
  run.py         CLI
scripts/         Droid workflow helpers: request validation, merge gate
studies/         one folder per study model
calibration/     quality-gate calibration reports
```
