# Model card: Rest tremor amplitude score, MDS-UPDRS 3.17 style (synthetic)

`cvm_tremor_updrs_synthetic` v1 · module `hand_tremor` · target `rest_tremor_score` (0-4) · status **needs validation** · trained 2026-10-17 by Training kit

## Intended use

Demonstrates the path for a tremor study model. The amplitude bands are defined in cm; converting from hand-size units assumes a 10 cm hand, so the score needs calibration on clinician-rated videos before use.

Every prediction goes to clinician review before it enters a participant's record. This model is not clinically validated and must not be used for diagnosis.

## Data

- **Dataset:** Synthetic hand-tremor tracks (rule-labelled)
- **Licence:** Generated in this repository (MIT)
- **Label:** `updrs_3_17` (synthetic), as `score`
- **Captures used:** 800 from 800 cases/people; 0 more failed the module's quality gate and were excluded
- **Notes:** Labels apply the MDS-UPDRS 3.17 amplitude bands to known ground truth, assuming a 10 cm hand; not clinician ratings.

## Performance (out-of-fold, grouped by case)

| Metric | Value |
|---|---|
| MAE | 0.294 (predicting the mean: 0.822) |
| RMSE | 0.387 |
| Pearson r | 0.914 |
| Folds / ridge λ | 5 / 0.01 |

### By fps

| Group | n | MAE | r | AUC | Excluded by quality gate |
|---|---|---|---|---|---|
| 24 | 248 | 0.308 | 0.914 | – | 0 (0%) |
| 30 | 258 | 0.280 | 0.916 | – | 0 (0%) |
| 60 | 294 | 0.292 | 0.915 | – | 0 (0%) |

Worst subgroup (n ≥ 20): **24**, MAE 0.308.

## Limitations

- Labels come from rules applied to synthetic ground truth, assuming a 10 cm wrist-to-knuckle hand. They are not clinician ratings.
- Synthetic tracks start after landmark detection; detection on real video is tested separately (services/cv/tests/test_tremor_video_e2e.py).
- Camera shake from a hand-held phone looks like hand tremor; the protocol asks for a propped-up phone.
- The 0-4 bands are log-spaced in amplitude; a linear head on linear amplitude fits them only approximately.

## Reproduce

```bash
python -m vfcv.run studies/tremor_updrs_synthetic/study.yaml
```

Inputs: the 8 features of `hand_tremor`. Training kit v0.1.0.
