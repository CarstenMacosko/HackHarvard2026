# Toward a generalized visual follow-up model

How to go from two hand-built CV modules to a system that adapts to any longitudinal research question, or can be honed in on a single disease. This document starts from what is in the repo today.

## 1. Where we are

| Layer | Today | Where it lives |
|---|---|---|
| Capture quality gate | Blur (Laplacian variance), exposure, duration, frame rate, target visible (hand landmarks or skin mask) | `services/cv/app/quality.py`, `packages/cv/src/quality.ts` |
| Condition modules | `eczema_photo` (skin mask → CIELAB redness → area), `finger_tapping` (MediaPipe hand landmarks → tap kinematics) | `services/cv/app/modules/`, `packages/cv/src/` |
| Feature vectors | 16 skin colour and texture features, 10 tapping-kinematics features | `MeasureResult.features` |
| Study-specific heads | Ridge regression trained in the browser on those features, cross-validated and registered with a validation status | `packages/shared/src/models.ts`, `/researcher/models/new` |
| Runtimes | The same module runs on-device (TypeScript port, parity-tested to OpenCV's integer math) and on the server (Python) | `packages/cv/test/parity.test.ts` |
| Governance | Clinician review of every result, a validation tag on every measurement, an audit log, model versions on every observation | `/researcher/review`, `/researcher/audit` |

What this already gives us:
- **A contract.** Every module is `prepare → quality_checks → measure (+ features)`.
- **A place for study-specific models.** Linear heads sit on top of each module's features.
- **A registry.** Every measurement traces to a versioned model.

What it does not give us yet: the features are **hand-designed**. A head can only learn what redness, area or tap timing can express. A new visual sign (scale, lichenification, dyskinesia, facial hypomimia) still needs a new module written by hand.

## 2. Target architecture: backbone + heads + gate + loop

```
capture ──► quality gate (generic + task-specific) ──► backbone embedding (frozen, versioned)
                                                         │        + module features (interpretable)
                                                         ▼
                                       study heads (ridge → MLP → LoRA fine-tune)
                                                         │
                                              clinician review ──► labels ──► retrain / validate
```

1. **Backbone embeddings (general).** Each capture becomes a fixed-length vector from a pretrained encoder, stored next to the existing interpretable features, with the encoder version.
   - **Photos:** a self-supervised image encoder such as DINOv2 (ViT-S/14, 384-d) on the server. A dermatology-specific embedding model is worth evaluating where its licence allows. On-device, MediaPipe's **Image Embedder** ships in the `@mediapipe/tasks-vision` package we already load, so it is a small addition to `lib/cv-client`.
   - **Video:** landmark streams (MediaPipe Hands/Pose, which we already run) feed a small temporal encoder. Appearance-based signs (tremor, dyskinesia) need a video encoder such as VideoMAE-style models on the server.
2. **Heads (specific).** What the wizard does today, but on `[embedding ‖ features]`.
   - Ridge first: it needs few labels, is cross-validated and is easy to audit.
   - Then a small MLP or ordinal head once a study has hundreds of labels.
   - Then parameter-efficient fine-tuning of the backbone (LoRA) for the hardest signs, trained on GPU (`adroit/` has the Slurm template).
3. **Quality gate (both).** Blur and exposure are universal. "Is the target visible?" generalises through text-prompted segmentation: a model that can find "left inner elbow" or "nail plate" from the protocol text. Its mask feeds both the gate and the measurement region.
4. **Learning loop.**
   - Every clinician accept, correct or reject is a label. Corrections are especially valuable because they mark exactly where the model was wrong.
   - The review queue can be ordered by model uncertainty (active learning).
   - Retraining produces a new model *version*. Studies pin a version, and the registry records which observations came from which.

The plumbing for this exists: `CVModule` already returns a `features` dict, observations already store `model_version`, and the registry already versions heads. Adding a backbone means adding one feature group (`embedding`) and one server endpoint, without changing the data model.

## 3. Generalizing to any research question

The workflow builder (`/researcher/builder`) is the entry point. It maps a clinician's description onto catalog components and marks each proposed measurement *validated*, *reusable but needs validation*, or *needs a new model*. The generalized model changes what "needs a new model" costs:

| Step | Today | With a backbone |
|---|---|---|
| New body region | New skin-mask rules | Text-prompted region segmentation from the protocol |
| New visual sign (e.g. scaling) | New module code | Label ~100–300 captures, train a head on embeddings in the wizard |
| New movement task (e.g. gait, pronation-supination) | New module code | Reuse the pose/hand landmark streams and add a temporal head |
| Capture standardisation | Written instructions | Add a reference card (colour + scale) detected in-frame for colour and size calibration |

## 4. Honing in on one disease

Generic embeddings get a study started. A primary or secondary endpoint needs a model validated for that specific use:
1. **Define the endpoint** in clinical terms, e.g. EASI regional erythema 0–3 per body region, or MDS-UPDRS 3.4 finger-tapping 0–4.
2. **Collect labelled data** with at least two blinded raters per capture, so inter-rater agreement (weighted κ, ICC) sets the ceiling the model is judged against.
3. **Fine-tune** on that data: heads first, then backbone adaptation if the head plateaus.
4. **Evaluate** against the raters, not just a held-out loss:
   - agreement with each rater, compared with rater-vs-rater agreement;
   - Bland–Altman bias;
   - performance in each subgroup (Fitzpatrick skin type I–VI, device, lighting, site), reporting the *worst* subgroup;
   - test-retest repeatability on same-day duplicate captures.
5. **Lock** the model version for the study, record a model card (data, metrics, intended use, known failure modes), and route any change through change control.
6. **Monitor drift** in production: per-site and per-device feature distributions, quality-gate pass rates, and the clinician correction rate over time.

## 5. A lesson from our own demo

The training wizard's first synthetic dataset used one camera-noise level for every image. The head learned that a texture feature, which mostly measures noise, predicted the grade. On a real-looking photo with slightly more noise it predicted **5.09 on a 0–4 scale**.

We fixed this three ways:
- vary noise in the synthetic data;
- clamp predictions to the training label range;
- label any clamped value "outside training range".

This is exactly the kind of shortcut learning that subgroup evaluation (step 4) exists to catch, and why every custom model starts as *needs validation*.

## 6. Roadmap

| When | What | Owner (see `HACKATHON_PLAN.md`) |
|---|---|---|
| Done | Modules + feature vectors, on-device parity, ridge heads, registry, review loop | all |
| Next (days) | On-device image embeddings via MediaPipe Image Embedder; heads on `[embedding ‖ features]` | B + D |
| Next (days) | Server embedding endpoint (DINOv2 ViT-S) in `services/cv`; store embeddings with version | D |
| Weeks | "Train from reviews": build training sets from accepted/corrected observations; uncertainty-ordered review queue | A + B |
| Weeks | Model cards and subgroup reports in the registry; version pinning per study | A |
| Months | Region segmentation from protocol text; reference-card calibration; LoRA fine-tuning on Adroit | D |

## 7. Guardrails

- **Bias.** Colour-based measures are sensitive to skin tone. The current skin mask is a rule-based baseline that will miss some tones; that is why it is tagged *needs validation*. Subgroup reporting is a release requirement, not an extra.
- **Privacy.** Analysis runs on the participant's device first, so unusable captures never need to leave the phone. Uploads go to private storage behind signed URLs.
- **Regulatory.** As soon as a measurement informs clinical decisions it is likely Software as a Medical Device. Keep the clinician-in-the-loop review, version locking and audit trail that are already in place.
