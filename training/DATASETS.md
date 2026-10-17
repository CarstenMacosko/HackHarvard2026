# Datasets for study models

What each source can and cannot support, how to get it, and its licence. **A model is only as meaningful as its label.** Check what the label really is before choosing a dataset (a differential diagnosis, a self-report, a rule applied to synthetic ground truth, or a clinician's severity grade).

The project accepts research and non-commercial licences (decision of 2026-10-17). Models trained on non-commercial data must be retrained before any commercial use.

## Loaders in the kit

| `dataset:` | Media | Labels | Licence | Access | Used by |
|---|---|---|---|---|---|
| `scin` | 10,407 smartphone photos, 5,033 cases (6,557 photos in 3,108 gradable cases) | Dermatologist-weighted differential diagnosis (Eczema, Psoriasis, …), dermatologist and self-reported Fitzpatrick type, gradability, self-reported texture and symptoms | SCIN Data Use License (attribution; no re-identification; commercial use allowed) | Public GCS bucket `gs://dx-scin-public-data`, downloaded automatically | `eczema_likelihood_scin`, `psoriasis_likelihood_scin`, `scaling_scin`, gate calibration |
| `fitzpatrick17k` | 16,577 atlas photos, 114 conditions | Atlas diagnosis, Fitzpatrick type (1–6) | CC BY-NC-SA 3.0 | Labels CSV on GitHub; images from the atlas URLs (blocked from the cloud sandbox; use Adroit) or the authors' request form | `psoriasis_fitzpatrick17k` (train on Adroit) |
| `synthetic_tapping` | Hand landmark tracks | MDS-UPDRS 3.4 anchors applied to known ground truth, with assumed cut-offs | MIT (generated here) | Generated on first use | `tapping_updrs_synthetic` |
| `synthetic_tremor` | Hand landmark tracks | MDS-UPDRS 3.17 amplitude bands applied to known ground truth (10 cm hand assumed) | MIT (generated here) | Generated on first use | `tremor_updrs_synthetic` |
| `folder` | Any photos/videos/landmark tracks + `labels.csv` | Whatever you provide (e.g. your clinicians' grades) | Yours: record it in `dataset.yaml` | Local path | Study-collected or Adroit-fetched data |

Sources: [SCIN](https://github.com/google-research-datasets/scin) (Ward et al., JAMA Netw Open 2024), [Fitzpatrick17k](https://github.com/mattgroh/fitzpatrick17k) (Groh et al., 2021).

## What the public data cannot give you (yet)

- **Severity grades for eczema or psoriasis** (EASI, SCORAD, PASI, per-sign erythema/scaling 0–4). We found no openly downloadable photo dataset with these labels. SCIN and Fitzpatrick17k label *which* condition, not *how severe*. A severity endpoint needs clinician-graded photos: two blinded raters on 150–300 study captures, loaded with `dataset: folder`.
- **Clinician-rated finger-tapping or tremor videos.** No openly downloadable set exists. The movement models here use synthetic data to exercise the pipeline. For real ratings:
  - [TULIP](https://zenodo.org/record/14199924) (Duke; Kim et al., CVPR 2024): six-camera video of 25 MDS-UPDRS Part III tasks, including finger tapping and rest tremor, rated by three clinical experts. Restricted Zenodo record: request access there. Once granted, export videos and ratings to a `folder` dataset (`labels.csv` with `updrs_3_4`, `updrs_3_17` columns and `group` = subject).
  - Smartphone tapping-video sets in recent papers (e.g. a 183-video MDS-UPDRS-rated set, University of Maribor proceedings; the Personalized Parkinson Project video subset, arXiv 2506.18925) are available, if at all, by contacting the authors.

## Other sources considered

| Source | Why it isn't loaded |
|---|---|
| [ISIC Archive](https://www.isic-archive.com) | Mostly dermoscopy of pigmented lesions (melanoma screening), not inflammatory disease. Per-image CC-0 / CC-BY / CC-BY-NC. Not reachable from the cloud sandbox. |
| [PAD-UFES-20](https://data.mendeley.com/datasets/zr7vgbcyr2/1) | Smartphone photos, but of skin *lesions* (six cancer-related diagnoses), with no eczema or psoriasis. Licence on the Mendeley record; we could not open it from the sandbox, so verify before use. |
| [DDI: Diverse Dermatology Images](https://aimi.stanford.edu/datasets/ddi-diverse-dermatology-images) (Stanford) | Balanced across Fitzpatrick I–VI, but lesions (benign/malignant) only. Access through Stanford AIMI's terms. Useful to audit skin-tone bias of the skin mask, not to train inflammatory-disease heads. |
| DermNet and other atlas sites | Copyrighted images without an open licence. Do not scrape. |

## Adding a dataset

1. Write `vfcv/datasets/<name>.py` with `load(**options) -> list[Example]` and a `DatasetInfo` that has the **real** licence, URL and citation. `scin.py` is the template.
2. Register it in `vfcv/datasets/__init__.py`.
3. Add a row above: media, the actual meaning of each label, licence, access.
4. Download only from the official host, and never commit media (`training/.cache/` is git-ignored).
