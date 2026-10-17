# Task: build the CV model for a new longitudinal study

You are working in the Visual Follow-Up Platform repository. A researcher used the workflow
builder to request a study-specific measurement that no existing model provides. Their request
is in `.droid/request.json`:

- `condition`: the condition or study, e.g. "Plaque psoriasis"
- `measurement`: `{name, label, unit}` the study wants on its timeline (`name` is snake_case)
- `media_type`: `photo` or `video`
- `description`: what the clinician wants to track, in their words
- optional `dataset_hint`, `study_id` (restrict the model to one study), `task` (the drafted protocol task)

Your job is to produce a trained, evaluated, documented study model **using the repository's
training kit**, or to stop honestly if the data it needs is not available. A human reviews your
pull request; nothing you produce is used clinically.

## Read first

1. `training/README.md`: how the kit works (study spec → dataset → module features → ridge head → model card).
2. `training/DATASETS.md`: every dataset the kit can load, its licence, labels, and what it can and cannot support.
3. `training/studies/*/study.yaml`: five worked examples. `scaling_scin` and `psoriasis_likelihood_scin` are photo studies on public data; `tremor_updrs_synthetic` is a video study on synthetic data.
4. `services/cv/app/modules/base.py` (the `CVModule` contract) and `services/cv/app/modules/hand_tremor.py`, the reference example of a complete module: pure signal functions, quality checks with patient-facing retry messages, measurements, a feature vector, tests in `services/cv/tests/test_hand_tremor.py`, and an on-device port in `packages/cv/src/tremor.ts` with parity fixtures.

## Decide the approach

Pick the **smallest** change that can honestly produce the measurement:

A. **Existing module, new head (preferred).** The measurement can plausibly be learned from an existing module's features: `eczema_photo` exposes 16 colour/texture features, plus the 1,024-value `embedding` feature group for photos (`feature_groups: [embedding]`); `finger_tapping` and `hand_tremor` expose kinematics. Write only `training/studies/<slug>/study.yaml`.

B. **New dataset loader.** The right labels exist in a dataset the kit can't load yet. Add `training/vfcv/datasets/<name>.py` following `scin.py` (`load(**options) -> list[Example]` plus a `DatasetInfo` with the **real** licence, URL and citation), register it in `training/vfcv/datasets/__init__.py`, and add it to `training/DATASETS.md`. Only use datasets whose licence permits research use, and only download from the dataset's official host. If the data needs an access request, a login or a data-use agreement, do not work around it: go to "Stop if data is missing".

C. **New module.** The measurement needs signals no module computes (a new movement task, a new body region, a new visual sign that needs a dedicated feature). Implement it like `hand_tremor.py`: pure functions first, unit tests on synthetic inputs with known ground truth (extend `services/cv/app/synthetic.py` if useful), then the module class with quality checks, then register it in `services/cv/app/registry.py` and add its catalog component(s) to `packages/shared/src/catalog.ts`. Port it to `packages/cv/src/` with parity fixtures (`services/cv/app/parity.py`, then `python services/cv/scripts/export_parity_fixtures.py`) only if it must run on-device.

## Write the study spec

`training/studies/<slug>/study.yaml`, where `<slug>` is snake_case, ends with the data source (e.g. `scaling_fitzpatrick17k`) and matches `id:`. Required: `id, name, description, condition, module, dataset, target {name, label, unit, source_label, kind}`. Set `target.name` to the requested `measurement.name` and `target.label`/`unit` to the request. Use:

- `kind: probability` or `binary` for 0-1 labels (then also `select_by: rmse`), `score` for ordinal or continuous labels
- `subgroup: fitzpatrick` for any skin-photo dataset that provides skin type; report it even when it looks bad
- `lambdas`: wider grids (up to 1e5) when using the embedding group
- `intended_use` and `limitations`: specific and honest. Say what the label really is (a dermatologist's differential diagnosis is not a severity grade; a self-report is not a clinical sign; synthetic labels are not clinician ratings).
- `study_id` from the request, if given

## Train and evaluate

```bash
cd training
python -m vfcv.run studies/<slug> --check          # validate the spec
python -m vfcv.run studies/<slug> --source droid   # train, evaluate, write model.json + metrics.json + model_card.md, refresh the bundle
```

Read the model card you produced. If the model does not beat the baseline (MAE not below `baseline_mae`, or AUC ≤ 0.55 for binary targets), **keep it** but say so plainly in the limitations and in your summary; do not tune on the evaluation folds until it looks good, and never edit the generated metrics or cards by hand.

## Stop if data is missing

If no available dataset carries a label that honestly corresponds to the measurement, do **not** invent labels, relabel another dataset's labels as something they are not, or generate synthetic labels for a clinical sign without saying so. Instead:

1. still write `study.yaml`, using `dataset: folder` with `dataset_options: {path: data/<slug>}` (the format is in `training/vfcv/datasets/folder.py`), so the study trains as soon as data arrives;
2. write `training/studies/<slug>/DATA_NEEDED.md`: the exact label needed (scale, raters, number of captures, subgroups), candidate public datasets with links and licences and how to request access, and the consented in-study collection that would work instead.

## Rules

- Change only what the approach needs. Do not modify `.github/`, `apps/web/app/api/`, `supabase/`, `services/agent/`, any `package.json` or lockfile, or env files. The workflow rejects the run otherwise.
- Never commit media, landmark tracks, embeddings or model weights (`training/.cache/` is git-ignored; keep data there). Text fixtures for tests are fine.
- New models always start as `reusable_needs_validation`. Never mark anything `validated`.
- Do not run `git commit` or `git push`; the workflow commits after its checks pass.
- Before finishing, run and fix until these pass:
  ```bash
  cd training && python -m pytest -q && python -m vfcv.run studies/* --check
  cd ../services/cv && python -m pytest -q
  cd ../.. && npm test
  ```

## Finish with a summary

Write `.droid/summary.md` (it becomes the pull request description) with:
- what was requested and which approach (A, B or C) you took, and why
- the dataset, its licence, and what its labels actually are
- headline metrics against the baseline, the worst subgroup, and how many captures the quality gate excluded
- limitations, and what data or validation would make the model fit for a study endpoint
