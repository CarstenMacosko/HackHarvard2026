# Model card: Finger-tapping score, MDS-UPDRS 3.4 style (synthetic)

`cvm_tapping_updrs_synthetic` v1 · module `finger_tapping` · target `tapping_score` (0-4) · status **needs validation** · trained 2026-10-17 by Training kit

## Intended use

Demonstrates the end-to-end path for a movement-disorder study model. Replace the dataset with clinician-rated videos (e.g. TULIP) before using the score for anything.

Every prediction goes to clinician review before it enters a participant's record. This model is not clinically validated and must not be used for diagnosis.

## Data

- **Dataset:** Synthetic finger-tapping tracks (rule-labelled)
- **Licence:** Generated in this repository (MIT)
- **Label:** `updrs_3_4` (synthetic), as `score`
- **Captures used:** 800 from 800 cases/people; 0 more failed the module's quality gate and were excluded
- **Notes:** Labels apply the MDS-UPDRS 3.4 anchor wording to known ground truth with assumed numeric cut-offs; not clinician ratings.

## Performance (out-of-fold, grouped by case)

| Metric | Value |
|---|---|
| MAE | 0.570 (predicting the mean: 0.774) |
| RMSE | 0.742 |
| Pearson r | 0.631 |
| Folds / ridge λ | 5 / 100 |

### By fps

| Group | n | MAE | r | AUC | Excluded by quality gate |
|---|---|---|---|---|---|
| 24 | 266 | 0.556 | 0.699 | – | 0 (0%) |
| 30 | 254 | 0.533 | 0.608 | – | 0 (0%) |
| 60 | 280 | 0.617 | 0.596 | – | 0 (0%) |

Worst subgroup (n ≥ 20): **60**, MAE 0.617.

## Limitations

- Labels come from rules applied to synthetic ground truth, with assumed numeric cut-offs for slight/mild/moderate slowing. They are not clinician ratings.
- Synthetic tracks start after landmark detection; detection on real video is tested separately (services/cv/tests/test_video_e2e.py).
- A linear head cannot reproduce the scale's max-of-domains rule exactly; errors cluster at score boundaries.

## Reproduce

```bash
python -m vfcv.run studies/tapping_updrs_synthetic/study.yaml
```

Inputs: the 10 features of `finger_tapping`. Training kit v0.1.0.
