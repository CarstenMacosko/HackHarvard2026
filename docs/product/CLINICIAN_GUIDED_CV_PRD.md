# PRD: Clinician-guided CV model development

**Pilot condition:** focal hand dystonia with dystonic tremor  
**Foundation:** Parkinson's hand-movement tasks and essential-tremor measurements  
**Product owner:** study team  
**Status:** proposed  
**Date:** 2026-10-17

## 1. Purpose

Enable a clinician and Factory Droid to develop a new, condition-specific computer vision (CV) measurement through repeatable iterations. The clinician defines the symptom and rating rubric, reviews labels and errors, and decides whether a model is suitable for a study. Droid finds reusable components, prepares a data and training plan, writes or adapts code, runs experiments when suitable data exists, and produces a reviewable candidate. The application retains its shared capture, quality, observation, and clinician-review contracts.

The first example builds **longitudinal tracking of focal hand dystonia with dystonic tremor** on motion components used for Parkinson's finger tapping and hand tremor, including essential tremor. Dystonia is a distinct movement disorder; Parkinson's and essential-tremor *diagnosis scores* do not combine into a dystonia score. The reusable pieces are hand landmarks, capture checks, tapping kinematics, tremor signals, and the training and review infrastructure. A new posture measurement and clinician-labeled target are required.

Factory Droid can manage the development loop and invoke Python training on a machine with approved data and compute. Chalk is not a dependency for this pilot. This PRD describes a research measurement for clinician review, not autonomous diagnosis or treatment advice.

## 2. Problem and desired outcome

The repository has `finger_tapping` and `hand_tremor` video modules, a model registry, and a training kit. `hand_tremor` lists both Parkinson's and essential tremor as applicable conditions, but the bundled movement study heads were trained on **synthetic landmark tracks and synthetic labels**. Their scores do not establish clinical validity for either condition. There is no implemented dystonia-specific posture model or clinician-labeled longitudinal dystonia dataset in the repository.

A clinician who asks to “track how an affected hand postures and shakes during the same task each week” needs a fixed capture protocol, a precisely defined endpoint, repeated consented videos, expert labels, and an evaluation against those labels. Reusing a hand tracker is valuable; it does not remove those requirements.

**Desired outcome:** the clinician can specify a dystonic hand symptom, inspect which existing motion components apply, commission the missing data and labels, review each candidate's errors and subgroup results, and approve a version for a stated research use only after agreed gates pass. When labels are absent, Droid returns `data_needed` with a usable collection and annotation plan instead of an invented score.

## 3. Users, capture, and target measurements

- **Movement-disorder clinician:** defines the task that reliably evokes the participant's symptom, rating anchors, acceptable capture variation, and meaningful change; independently rates and adjudicates videos.
- **ML reviewer:** checks component lineage, data rights, patient-separated evaluation, model cards, and code changes.
- **Participant:** submits repeat hand videos under a study protocol and receives quality or retake guidance.

**Example request:** “For participants with clinician-confirmed focal hand dystonia and dystonic tremor, record the affected hand at rest, while held out, during finger tapping, and during a clinician-selected provoking task at each follow-up. Track abnormal posture and tremor during the same tasks over time for clinician review.”

The pilot keeps outputs separate:

1. `task_evoked_posture_grade`: a **new, provisional ordinal endpoint** for visible abnormal hand or wrist posture during the provoking task. A movement-disorder clinician must approve its anchors and task rules before labeling. It is not an established diagnosis from video alone.
2. `task_tremor_amplitude` and `task_tremor_freq_hz`: task- and hand-specific motion measurements adapted from the existing tremor signal. Compare like-for-like tasks and capture conditions across visits. These are not essential-tremor or Parkinson's probabilities.

The study may retain tapping rate, amplitude decrement, and rhythm as contextual measurements. It must not present those values as dystonia severity without target-specific evidence. Clinicians may use medical history and examination to establish the cohort; the CV output measures observable movement only.

## 4. Existing foundation and tiered reuse

| Capability | Present today | Gap for this pilot |
|---|---|---|
| Hand video processing | MediaPipe hand tracking; blur, exposure, duration, frame-rate, and visibility checks | Test intended phone views, hand positions, occlusion, and repeatability. |
| Parkinson's movement path | `finger_tapping` measures rate, opening amplitude, decrement, and rhythm | Its synthetic trained head does not provide a dystonia label or validated clinical score. |
| Tremor path | `hand_tremor` measures amplitude, frequency, and spectral features; its catalog includes essential tremor | Real essential-tremor data must evaluate or calibrate the branch; the current synthetic UPDRS study is not an essential-tremor model. |
| Training kit | One study spec, one CV module and media item per example, grouped cross-validation, model card | Link task videos by visit, preserve task labels, and evaluate a new posture endpoint on real patient data. |
| Droid workflow | A request can yield a study model or `DATA_NEEDED.md` and a draft PR | The current Droid gate excludes platform/API changes; implement linked-task support in a separate reviewed platform change first. |
| Participant capture | The protocol schema supports tasks, but the check-in page currently selects the first task | A small sequential capture flow is needed before unsupervised multi-task home collection. |

For each request, Droid records the **lowest defensible reuse tier**, exact component versions, and evidence:

| Tier | Decision | Dystonia example |
|---|---|---|
| 0 | Invoke an approved model whose input, target, and use already match | No such model exists today. |
| 1 | Compose existing measurements without a new learned target | Show tapping and tremor measurements separately, with their actual validation status. |
| 2 | Train a new head on existing features | Test whether clinician-rated posture grades are predictable from the tapping and tremor features already exported by the modules. |
| 3 | Extend an extractor or task protocol | Add posture, position-dependence, or task-evoked movement features if Tier 2 misses the target. |
| 4 | Train a new visual backbone or measurement pipeline | Use only if landmark-based approaches fail on representative captures and sufficient labeled data and compute exist. |

Reusing code, features, or an externally published model does **not** transfer its clinical validation. Candidate outputs inherit neither Parkinson's nor essential-tremor disease claims. Eczema remains an existing photo workflow, outside this video pilot.

## 5. Clinician–Droid development loop

1. **Specify.** Save intended research use, cohort definition, affected hand, capture tasks, cadence, target, and rubric version. Droid asks the clinician to resolve target or label ambiguity before training.
2. **Match and record lineage.** Inspect local modules and proposed external code. Record input and output contracts, reuse tier, component versions, validation status, and why each candidate does or does not measure the requested symptom.
3. **Plan data.** Inventory lawful video access and labels. Define case, visit, and task identifiers; rater fields; subgroup metadata; consent; retention; and a patient-separated held-out set. If target labels are missing, write a training-ready spec and `DATA_NEEDED.md`.
4. **Collect and label.** Use supervised videos first. Two qualified raters independently grade a representative subset using the same rubric; retain both ratings and adjudication. Record task windows, affected side, medication or treatment state, camera and frame rate, and unusable captures.
5. **Train the smallest useful candidate.** Validate tapping and tremor signals on real videos, then test a simple head for the new posture grade. Add posture-specific features only when error review shows existing features miss the sign. Pin media manifest, splits, code, preprocessing, and artifacts for every run.
6. **Evaluate.** Compare against a trivial predictor and a model using each reused feature family alone. Report patient-separated test results, rater agreement, capture failures, uncertainty, and available subgroups. Keep the held-out set out of tuning and relabeling decisions.
7. **Review and iterate.** Clinicians inspect missed abnormal postures, tremor artifacts, occluded hands, and within-person instability. Feedback creates a new rubric, dataset, feature, or model version without replacing earlier evidence.
8. **Release for a stated use.** A human reviews code, data rights, model card, and evaluation. The study pins an accepted version; observations retain model, protocol, task, and rubric versions. Clinical validation requires separate evidence and approval.

## 6. Functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| FR-1 | Structured request | Persist condition, symptom, intended use, affected hand, task protocol, cadence, study ID, and requester; return a stable request ID. |
| FR-2 | Clinician specification loop | Version clinician answers, endpoint anchors, and task instructions; unresolved target questions block training. |
| FR-3 | Tiered reuse record | Record candidates, input/output contracts, reuse tier, component and model versions, validation status, and rationale. |
| FR-4 | Data readiness | Return `data_needed` with exact missing videos and labels, access and collection plan, and a ready-to-run study spec. |
| FR-5 | Visit-level data linkage | Associate each task video with participant, visit, hand, task, and capture time; group all visits from one participant in the same data partition. |
| FR-6 | Label provenance | Preserve rubric version, individual rater, rating time, adjudication, and media ID; keep raw media outside Git. |
| FR-7 | Reproducible experiment | Record dataset revision, patient split, feature and module versions, training code revision, settings, and artifact hashes. |
| FR-8 | Evaluation package | Produce a model card with exact endpoint meaning, baselines, held-out and subgroup results, rater agreement, failed captures, and limitations. |
| FR-9 | Human approval and versioned inference | New candidates start as `reusable_needs_validation`; authorized humans approve a stated study use, and observations retain compatible versions. |
| FR-10 | Iteration | Preserve every candidate and review decision when feedback creates a new dataset, rubric, or model version. |

## 7. Data sources and work outside the codebase

| Source or activity | Use | Access and limitation |
|---|---|---|
| [TIM-TREMOR](https://doi.org/10.4121/uuid:522d14ed-3019-4206-b49e-a4e674b6440a) | Research starting point for tremor features across Parkinsonian, essential, and dystonic tremor; the [published analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC11098891/) describes 55 participants and task-labeled videos. | Verify the original dataset's current license, download route, subject IDs, task labels, and permission for this use before import. Tremor type and severity labels do not provide the proposed longitudinal posture grade. |
| [TULIP](https://zenodo.org/records/14262223) | Clinician-rated Parkinson's motor-task videos for component checks. | Request restricted access and verify task and license fit; its multi-camera setting differs from home phone capture. |
| [Dystonia Coalition](https://dc.rarediseasesnetwork.org/resources-researchers-and-clinicians) | Potential clinically characterized dystonia examinations. | Submit a research and data-access request. Confirm whether the agreement allows video export, model training, and the specific hand/task subset; viewing access alone is insufficient. |
| [PoET](https://github.com/peach-lucien/PoET) and [VisionMD](https://github.com/mea-lab/VisionMD-DesktopApp) | Candidate implementations to compare for tremor extraction. | Assess runnable weights, input protocol, dependency and code/weight licenses, and phone-video performance before adopting an adapter. Neither supplies dystonia target labels. |
| **Prospective study collection** | Primary source for the pilot endpoint and longitudinal evaluation. | Obtain consent and approved private storage for repeated, intended-device videos from clinician-confirmed focal hand dystonia cases, plus Parkinson's, essential-tremor, and appropriate comparison cases. Clinicians define the rubric and label posture and tremor by task and hand. |

The collection manifest must include participant and visit IDs; diagnosis established outside the CV model; hand and task; video timing, frame rate, device and camera view; treatment or medication state; individual expert ratings and adjudication; and data-use restrictions. Preserve excluded videos with failure reasons. A clinician and study statistician set cohort size, subgroup coverage, and success thresholds for the intended use before evaluation; a small demo set cannot establish clinical validity.

Split by **participant**, not by clip, visit, or frame. Reserve an independent test set before model tuning. For the posture grade, report ordinal error, confusion and agreement against each clinician as well as inter-rater agreement. For tremor measurements, report agreement with clinician or instrumented references when available, task-to-task behavior, and repeat-capture stability. Report failure and performance by available device, hand side, task, severity, and treatment-state groups; do not infer a subgroup result from too few cases.

## 8. Implementation sequence and first delivery

1. **Clinical specification:** ratify the symptom target, provisional posture-grade anchors, comparison tasks, visit cadence, and labeling guide. Produce a consent and media-handling plan with the study's clinical and privacy owners.
2. **Data feasibility:** request access to TIM-TREMOR, TULIP, and the Dystonia Coalition as applicable; document each source's license and label meaning. If approved target labels are absent, have Droid open a *(needs data)* draft PR containing the study spec, `DATA_NEEDED.md`, and annotation instructions.
3. **Foundation checks:** run the local tapping and tremor modules on permitted real videos, compare signals with clinician or accelerometer references, and correct capture and quality failures. Build an essential-tremor study head only if real labels support its stated target; retain `reusable_needs_validation`.
4. **Platform composition:** in a human-reviewed platform change, add visit/task linkage and a training input that combines task-specific feature vectors. Keep the existing per-task observation contract and version each feature source. This exceeds the current Droid workflow's allowed edit paths.
5. **New dystonia features and head:** add posture or position-dependent features only after testing existing signals. Train the posture-grade candidate on clinician-labeled cases with participant-level grouping. Keep tremor amplitude and frequency as separate task measurements.
6. **Error review and second iteration:** generate a model card and held-out evaluation; review disagreements and failures with the clinician; revise the rubric, collection, or features and compare a second candidate without modifying the original test set.
7. **Study integration:** after the research model passes predefined gates, connect the approved version to study observations and review. For home collection, make the existing check-in flow capture each protocol task in sequence and give task-specific retake guidance. Reuse the registry and clinician review views; no new labeling UI is required for the first supervised pilot.

The first demo can stop after steps 1–2 with an honest `data_needed` result. Training, clinical scoring, and participant rollout must wait for suitable data and review. No Factory Droid or GitHub Actions configuration by itself supplies labels, compute, consent, or clinical validation.

## 9. Non-goals and dependencies

- No autonomous diagnosis of dystonia, Parkinson's disease, or essential tremor; no treatment recommendation.
- No claim that synthetic tapping or tremor scores are clinically validated, or that tremor frequency alone identifies a disease.
- No fusion of Parkinson's and essential-tremor diagnosis probabilities into a dystonia label.
- No automatic use of restricted videos, website examples, or external code/weights without applicable access and license rights.
- No Chalk dependency for the pilot; Droid orchestrates approved development and training tools rather than being the training compute itself.

**Key dependencies:** a movement-disorder clinician and independent raters; consented and legally usable videos; secure versioned media storage; a study statistician for evaluation design; training compute; and a human code and model review path.

## 10. Success criteria

- A clinician can explain the exact tracked symptom, tasks, rubric, and distinction between raw tremor measurements and the new posture grade.
- The reuse record shows which Parkinson's and essential-tremor components were used and makes no inherited disease-validity claim.
- Before target labels exist, the system returns a concrete `data_needed` plan without displaying a fabricated dystonia score.
- After suitable data exists, another team member can reproduce the candidate and patient-separated evaluation from pinned revisions.
- A clinician can inspect failures, request a second iteration, and compare both candidates without losing the first.
- No generated model becomes an active clinical endpoint simply because training finished or a PR was merged.

## References

- [Repository training kit](../../training/README.md), [dataset inventory](../../training/DATASETS.md), [Droid workflow](../DROID.md), [CV module contract](../../services/cv/app/modules/base.py)
- [Movement Disorder Society: dystonia](https://www.movementdisorders.org/MDS/About/Movement-Disorder-Overviews/Dystonia.htm) and [tremor classification consensus](https://pmc.ncbi.nlm.nih.gov/articles/PMC6530552/)
- [Dystonic tremor video case](https://pmc.ncbi.nlm.nih.gov/articles/PMC3863978/) and [video-based tremor measurement study](https://pmc.ncbi.nlm.nih.gov/articles/PMC8607978/)
- [TIM-TREMOR tremor-type study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11098891/) and [Dystonia Coalition access instructions](https://dc.rarediseasesnetwork.org/resources-researchers-and-clinicians)
