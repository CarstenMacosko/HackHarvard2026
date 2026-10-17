# Model card: Psoriasis likelihood (SCIN)

`cvm_psoriasis_likelihood_scin` v2 · module `eczema_photo` · target `psoriasis_likelihood` (probability) · status **needs validation** · trained 2026-10-17 by Training kit

## Intended use

Starting point for a psoriasis follow-up study: a supporting signal that a capture shows plaque-type disease. It does not estimate PASI; severity needs clinician-graded photos.

Every prediction goes to clinician review before it enters a participant's record. This model is not clinically validated and must not be used for diagnosis.

## Data

- **Dataset:** [SCIN: Skin Condition Image Network](https://github.com/google-research-datasets/scin)
- **Licence:** SCIN Data Use License (attribution required; re-identification prohibited)
- **Citation:** Ward A, et al. Creating an Empirical Dermatology Dataset Through Crowdsourcing With Web Search Advertisements. JAMA Netw Open. 2024;7(11):e2446615.
- **Label:** `psoriasis` (expert), as `probability`
- **Captures used:** 5190 from 2730 cases/people; 1366 more failed the module's quality gate and were excluded
- **Notes:** Crowdsourced smartphone photos; dermatologist differential diagnoses; no severity grades.

## Performance (out-of-fold, grouped by case)

| Metric | Value |
|---|---|
| MAE | 0.059 (predicting the mean: 0.060) |
| RMSE | 0.119 |
| Pearson r | 0.106 |
| AUC (label ≥ 0.5, 103 positives) | 0.616 |
| Folds / ridge λ | 5 / 30000 |

### By fitzpatrick

| Group | n | MAE | r | AUC | Excluded by quality gate |
|---|---|---|---|---|---|
| FST1 | 554 | 0.069 | 0.022 | 0.410 | 190 (26%) |
| FST2 | 1806 | 0.054 | 0.078 | 0.688 | 458 (20%) |
| FST3 | 1453 | 0.059 | 0.121 | 0.679 | 395 (21%) |
| FST4 | 781 | 0.055 | 0.118 | 0.564 | 167 (18%) |
| FST5 | 413 | 0.069 | 0.155 | 0.531 | 104 (20%) |
| FST6 | 51 | 0.040 | 0.214 | – | 17 (25%) |
| unknown | 132 | 0.084 | 0.244 | 0.795 | 35 (21%) |

Worst subgroup (n ≥ 20): **FST1**, MAE 0.069.

## Limitations

- Psoriasis is uncommon in SCIN (about 200 of 3,100 gradable cases carry any psoriasis weight), so positives are few.
- Labels are dermatologists' differential diagnoses from photos alone.
- Inputs are a general-purpose ImageNet embedding plus colour and texture features from a rule-based skin mask; neither was designed for skin, so check the subgroup table.
- Not a severity score (PASI).

## Reproduce

```bash
python -m vfcv.run studies/psoriasis_likelihood_scin/study.yaml
```

Inputs: the 1040 features of `eczema_photo` plus embedding. Training kit v0.1.0.
