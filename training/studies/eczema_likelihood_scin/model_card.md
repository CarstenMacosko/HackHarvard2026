# Model card: Eczema likelihood (SCIN)

`cvm_eczema_likelihood_scin` v2 · module `eczema_photo` · target `eczema_likelihood` (probability) · status **needs validation** · trained 2026-10-17 by Training kit

## Intended use

Supporting signal in atopic dermatitis studies: flags captures that look less like eczema (e.g. a different rash, or a photo of the wrong site) for clinician attention. It does not grade severity: SCIN has no EASI or SCORAD labels.

Every prediction goes to clinician review before it enters a participant's record. This model is not clinically validated and must not be used for diagnosis.

## Data

- **Dataset:** [SCIN: Skin Condition Image Network](https://github.com/google-research-datasets/scin)
- **Licence:** SCIN Data Use License (attribution required; re-identification prohibited)
- **Citation:** Ward A, et al. Creating an Empirical Dermatology Dataset Through Crowdsourcing With Web Search Advertisements. JAMA Netw Open. 2024;7(11):e2446615.
- **Label:** `eczema` (expert), as `probability`
- **Captures used:** 5190 from 2730 cases/people; 1366 more failed the module's quality gate and were excluded
- **Notes:** Crowdsourced smartphone photos; dermatologist differential diagnoses; no severity grades.

## Performance (out-of-fold, grouped by case)

| Metric | Value |
|---|---|
| MAE | 0.193 (predicting the mean: 0.199) |
| RMSE | 0.253 |
| Pearson r | 0.186 |
| AUC (label ≥ 0.5, 661 positives) | 0.639 |
| Folds / ridge λ | 5 / 30000 |

### By fitzpatrick

| Group | n | MAE | r | AUC | Excluded by quality gate |
|---|---|---|---|---|---|
| FST1 | 554 | 0.174 | 0.199 | 0.657 | 190 (26%) |
| FST2 | 1806 | 0.186 | 0.211 | 0.653 | 458 (20%) |
| FST3 | 1453 | 0.200 | 0.161 | 0.626 | 395 (21%) |
| FST4 | 781 | 0.199 | 0.242 | 0.679 | 167 (18%) |
| FST5 | 413 | 0.204 | 0.155 | 0.625 | 104 (20%) |
| FST6 | 51 | 0.203 | -0.026 | 0.337 | 17 (25%) |
| unknown | 132 | 0.192 | -0.048 | 0.406 | 35 (21%) |

Worst subgroup (n ≥ 20): **FST6**, AUC 0.337.

## Limitations

- Trained on crowdsourced smartphone photos of many conditions; eczema is one label among ~400.
- Labels are dermatologists' differential diagnoses from photos alone, without examination or history.
- Inputs are a general-purpose ImageNet embedding plus colour and texture features from a rule-based skin mask; neither was designed for skin, so check the subgroup table.
- Not a severity score. A severity model needs clinician-graded photos (see training/DATASETS.md).

## Reproduce

```bash
python -m vfcv.run studies/eczema_likelihood_scin/study.yaml
```

Inputs: the 1040 features of `eczema_photo` plus embedding. Training kit v0.1.0.
