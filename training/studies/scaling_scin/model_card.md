# Model card: Rough or flaky skin (SCIN, self-reported)

`cvm_scaling_scin` v2 · module `eczema_photo` · target `scaling_likelihood` (probability) · status **needs validation** · trained 2026-10-17 by Training kit

## Intended use

Exploratory proxy for scaling in psoriasis and eczema studies, where the workflow builder marks scaling as "needs a new model". It shows how far the existing features get before a dedicated scaling model is trained on clinician-graded photos.

Every prediction goes to clinician review before it enters a participant's record. This model is not clinically validated and must not be used for diagnosis.

## Data

- **Dataset:** [SCIN: Skin Condition Image Network](https://github.com/google-research-datasets/scin)
- **Licence:** SCIN Data Use License (attribution required; re-identification prohibited)
- **Citation:** Ward A, et al. Creating an Empirical Dermatology Dataset Through Crowdsourcing With Web Search Advertisements. JAMA Netw Open. 2024;7(11):e2446615.
- **Label:** `rough_or_flaky` (self report), as `binary`
- **Captures used:** 4396 from 2254 cases/people; 1121 more failed the module's quality gate and were excluded
- **Notes:** Crowdsourced smartphone photos; dermatologist differential diagnoses; no severity grades.

## Performance (out-of-fold, grouped by case)

| Metric | Value |
|---|---|
| MAE | 0.390 (predicting the mean: 0.397) |
| RMSE | 0.442 |
| Pearson r | 0.133 |
| AUC (label ≥ 0.5, 1200 positives) | 0.584 |
| Folds / ridge λ | 5 / 30000 |

### By fitzpatrick

| Group | n | MAE | r | AUC | Excluded by quality gate |
|---|---|---|---|---|---|
| FST1 | 467 | 0.390 | 0.097 | 0.568 | 153 (25%) |
| FST2 | 1579 | 0.382 | 0.092 | 0.560 | 398 (20%) |
| FST3 | 1228 | 0.384 | 0.140 | 0.583 | 323 (21%) |
| FST4 | 651 | 0.395 | 0.086 | 0.558 | 136 (17%) |
| FST5 | 337 | 0.418 | 0.259 | 0.658 | 80 (19%) |
| FST6 | 38 | 0.393 | 0.072 | 0.540 | 16 (30%) |
| unknown | 96 | 0.466 | 0.351 | 0.698 | 15 (14%) |

Worst subgroup (n ≥ 20): **FST6**, AUC 0.540.

## Limitations

- The label is the contributor's own description, not a clinician's assessment of scale.
- Only cases where the contributor described the texture are used.
- Scale is a fine texture; the module's single texture feature (Laplacian variance) also responds to blur and camera noise.

## Reproduce

```bash
python -m vfcv.run studies/scaling_scin/study.yaml
```

Inputs: the 1040 features of `eczema_photo` plus embedding. Training kit v0.1.0.
