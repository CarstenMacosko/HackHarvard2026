# PRD: Tiered focal hand dystonia CV demo

**Status:** proposed hackathon scope  
**Date:** 2026-10-17  
**Pilot use:** clinician-reviewed tracking of visible hand movement across visits  
**Target condition:** clinician-confirmed focal hand dystonia, using writing as the first provoking task

## 1. Product decision

Demonstrate a modular computer vision (CV) workflow in three visible steps: run the existing Parkinson's finger-tapping task, run the existing tremor measurement on an essential-tremor-style postural task, and show how both can feed a new writing-specific hand-posture task for focal hand dystonia research. Link the three task results to one example visit. The output describes observable movement for clinician review, not a diagnosis.

This is **tiered reuse of extractors, measurements, and training infrastructure**. The two foundation demonstrations are task measurements; neither supplies a validated disease probability to combine. Focal hand dystonia can be task-specific: abnormal hand posturing may become visible during writing while simpler actions look different. That is why a writing task is needed for the proposed extension. See the [clinical review of task-specific dystonia](https://pmc.ncbi.nlm.nih.gov/articles/PMC2652841/).

## 2. Starting point and limits

| Capability | Current repository | Hackathon decision |
|---|---|---|
| Shared open-source CV model | [`hands.py`](../../services/cv/app/modules/hands.py) downloads and invokes Google's pretrained MediaPipe Hand Landmarker. It returns 21 hand landmarks per video frame. | Reuse it for all three hand-video tasks. It is a general hand-tracking model, **not** a Parkinson's or essential-tremor classifier. |
| Parkinson's task branch | [`finger_tapping`](../../services/cv/app/modules/finger_tapping.py) computes tap rate, opening amplitude, decrement, and rhythm from those landmarks. The bundled [scoring head](../../training/studies/tapping_updrs_synthetic/model_card.md) was trained on synthetic rule labels. | Demonstrate these measured features on a finger-tapping clip; do not present the synthetic score as a clinical result. |
| Tremor task branch | [`hand_tremor`](../../services/cv/app/modules/hand_tremor.py) computes frequency, amplitude in hand-size units, and spectral features. It lists essential tremor as applicable, but the bundled [head](../../training/studies/tremor_updrs_synthetic/model_card.md) is a synthetic **rest-tremor** scoring example, not an essential-tremor model. | Demonstrate the raw measurements on a **postural** tremor clip; show quality and capture limits. |
| Skin branch | `eczema_photo` and SCIN-trained photo heads exist. | Outside this video pilot. |
| Model training | The [training kit](../../training/README.md) trains study heads on one module's features and produces evaluations and model cards. | Add a visit-level feature join for three tasks; train a new head only if the required clinician labels are available. |
| Participant flow | The [check-in page](../../apps/web/app/participant/check-in/page.tsx) currently uses the protocol's first task. | The only anticipated frontend change for a live participant demo is sequential capture of all three tasks. Preloaded demo media can exercise the backend without it. |

No module currently measures writing-specific abnormal posture, and no clinician-labeled focal hand dystonia study model is present. VisionMD is not integrated or needed for this demo. Existing movement study heads demonstrate the training path, not clinical validity.

## 3. Users and demo goal

- **Participant:** follows the tapping, postural-hold, and writing prompts if live capture is built; otherwise the demo uses clearly labeled, consented prerecorded clips.
- **Clinical researcher:** sees the separate tapping and postural-tremor outputs, then the proposed writing-posture feature and its source frames in a linked visit report.
- **ML reviewer:** sees source and module versions, quality status, and which labels would be required before fitting a dystonia head.

The demo target is two working foundation task runs plus one new, inspectable writing-posture measurement linked in a visit report. If the writing feature cannot be measured reliably from the chosen camera view, show that quality failure and the clinician's next capture request. A learned dystonia rating is a later experiment that depends on suitable clinician labels.

## 4. Capture protocol and measurements

All clips use the same participant ID, visit ID, hand side, capture time, device/frame rate, and protocol version. A fixed phone and consistent framing matter more than extracting many features. The clinical researcher chooses the affected hand and confirms the exact writing task before collection.

| Task | Suggested capture | Reused or new output | Quality gate |
|---|---|---|---|
| Finger tapping | About 10 seconds, full hand and wrist visible; thumb and index finger repeatedly open and close. | Existing tap rate, opening amplitude, decrement, rhythm. | Enough visible taps, stable framing, adequate light and frame rate. |
| Postural tremor | About 10–15 seconds with the arm held in the same instructed posture each visit; phone fixed, hand and wrist visible. | Existing tremor frequency, amplitude, power, and signal quality. | Automated hand-visibility and frame-rate checks; researcher flags camera motion or a posture mismatch during review. |
| Writing | Brief pen hold followed by about 15 seconds writing the same short phrase, filmed from a clinician-approved view that keeps fingers and wrist visible. | **New** writing/posture features: visible finger configuration over time, posture change from pen hold to writing, and time spent in a clinician-specified configuration. Show video frames that support the measurements. | Required landmarks visible; reject occluded fingers or a view that cannot show the chosen sign. |

The writing feature must describe something observable, such as index-finger extension or abnormal finger flexion during writing. The clinician chooses the sign and review rubric; the implementation must not infer muscle contraction, pain, or diagnosis from pixels. Hand landmarks may fail when the pen hides the fingers. The first release must show `insufficient visibility` in that case rather than a posture score. Wrist-angle claims require an additional validated forearm/pose signal; they are not part of the minimum demo.

**Endpoint for later training:** a clinician-defined, versioned ordinal rating of *visible task-evoked hand posture during writing*. Tremor amplitude and tapping measurements remain separate contextual outputs. Clinicians establish the participant's diagnosis outside the CV system.

## 5. Tiered model architecture

```text
Three task videos + task metadata
  -> shared decode, MediaPipe hand landmarks, quality gates
  -> finger_tapping features       (existing Parkinson's task branch)
  -> hand_tremor features          (existing tremor branch; postural task)
  -> writing_posture features      (new task-specific branch)
  -> visit-level feature record    (same person, visit, hand; versioned sources)
  -> optional posture-rating head  (requires clinician labels)
  -> clinician review and longitudinal comparison
```

Use the existing [`CVModule` contract](../../services/cv/app/modules/base.py) for `writing_posture`. Each branch retains its own quality result and feature version. The visit-level join records missing tasks explicitly and must not silently substitute a missing task, hand, or poor-quality clip. A future small, regularized head may use the complete concatenated feature record and task metadata to estimate the clinician's posture rating. It should report feature lineage and uncertainty; it cannot inherit the medical validity of a different condition's model.

The reuse ladder is:

1. **Invoke:** reuse an approved matching task component if it exists. The current tapping and tremor extractors qualify as technical components, not as approved dystonia endpoints.
2. **Compose:** display the three task measurements separately and link them to one visit. This is the minimum viable demo.
3. **Train a small head:** only with consented, clinician-rated writing videos and participant-separated evaluation. Compare tapping-only, tremor-only, writing-only, and combined feature sets to show whether composition adds value.
4. **Extend the extractor:** improve posture or pose features if reviewed errors show that the current hand landmarks miss the selected sign. A new visual backbone is outside hackathon scope.

## 6. Demo data

| Source | Hackathon use | What it cannot establish |
|---|---|---|
| [Original TIM-TREMOR record](https://doi.org/10.4121/uuid:522d14ed-3019-4206-b49e-a4e674b6440a) | If RGB video, matched accelerometer data, subject IDs, and permitted use are accessible, select matching postural clips to check the tremor branch. The [original paper](https://arxiv.org/pdf/1809.03218) points to this record. | It is not a labeled dataset for this writing-posture endpoint or longitudinal focal hand dystonia monitoring. |
| [Processed TIM-TREMOR GitHub subset](https://github.com/jiehu01/Parkinson-s-Disease-Tremor-Dataset) | Optional sensor-analysis example with attribution and verified reuse terms. | Its files are accelerometer arrays, not the RGB videos needed by the CV pipeline. |
| Demo recordings | Use consented, locally recorded nonpatient clips to test capture, task completion, quality gates, and visible movement features. If a clinical partner has suitable approved patient videos, use those under the applicable data agreement. | Volunteers imitating a symptom and synthetic motion cannot establish clinical accuracy or train a deployable disease model. |

TULIP and the Dystonia Coalition are not dependencies for this hackathon scope. Keep patient media outside Git. Store a manifest with task, side, person, visit, device, frame rate, consent/access terms, and label provenance. Split any training and evaluation by participant, not by clip or visit.

## 7. What the audience will see

| Demo moment | Input and visible output | Evidence and honest limit |
|---|---|---|
| Parkinson's foundation | A roughly 10-second finger-tapping clip → hand landmarks, tap count/rate, opening amplitude, and rhythm from existing `finger_tapping`. | Show the video beside its time series and quality result. Call it a **Parkinson's assessment task demo**, not Parkinson's detection. The synthetic scoring head stays hidden or clearly marked research-only. |
| Essential-tremor foundation | A fixed-camera, 10–15-second postural hand-hold clip → hand landmarks, dominant movement frequency, normalized amplitude, and spectral result from existing `hand_tremor`. | Show the video and movement trace, including frame rate and hand visibility. Call it an **essential-tremor-relevant task demo**; no ET-specific classifier or validated ET severity score exists here. |
| Dystonia extension | A writing clip from the clinician-selected view → proposed `writing_posture` result: one named finger-configuration measure, its timestamps/frames, and a quality result. | The researcher checks whether the cited frames actually show the selected posture. If fingers are hidden, display `insufficient_visibility` and request a better view. This module still needs to be built. |
| Tiered composition | The three outputs and their module versions appear under one example visit and hand, with separate quality statuses. | A local report or scripted view is enough for the weekend. Show which features can be reused and the exact missing clinician labels needed for a learned writing-posture rating. Do not display a combined disease score. |

Use approved patient clips only if access and consent are in place. Otherwise record the three tasks with the same consenting volunteer in one session so the example visit is genuine. Label volunteer recordings and synthetic signals as task demonstrations, with no claim that they represent Parkinson's disease, essential tremor, or dystonia. If only separate clips are available, show them as separate task examples and use a clearly labeled sample report for the visit composition. A proposed writing output must be labeled as proposed rather than shown as a measured result.

## 8. Build sequence for the hackathon

1. **Freeze the clinical demo definition.** A movement-disorder clinician selects the writing sign, hand, phrase, camera view, and provisional review anchors. Mark the anchors as study-specific.
2. **Create the postural-tremor task configuration.** Reuse `hand_tremor`; change the capture instructions and task ID, not the core signal code. Run existing synthetic-video checks and a few permitted real videos.
3. **Implement `writing_posture`.** Reuse hand tracking and quality gates; expose a small set of interpretable finger-posture measurements and supporting frame timestamps. Test visible, occluded, and wrong-task clips.
4. **Join the tasks.** Add a visit/task manifest and a backend composition step that records versioned features and missingness. Use a local scripted runner for the first integration test.
5. **Prepare data and labels.** Check the original TIM-TREMOR video route and terms if time allows. Have the clinician review any approved writing examples and create a versioned rubric. Without target labels, list the missing data and stop before fitting a dystonia head.
6. **Train only if justified.** With adequate approved labels, fit the smallest head and produce a participant-separated research evaluation; otherwise show the composition and annotation loop using clearly marked demonstration media.
7. **Present the flow.** For a live participant experience, make the small sequential-capture frontend change. Reuse the existing researcher and model registry views for the review; a scripted report is sufficient where those views cannot yet show the visit-level feature record.

Factory Droid can draft the task configuration, new module, tests, dataset manifest, experiment, and model card; the clinician owns the rubric and labels and reviews every candidate. Running a training command in Droid does not supply the required data or make a candidate clinically valid.

## 9. Non-goals and release rule

- No diagnosis of Parkinson's disease, essential tremor, or focal hand dystonia from a video.
- No claim that synthetic movement heads or TIM-TREMOR tremor labels validate a writing-posture grade.
- No VisionMD dependency for the hackathon demo.
- No dependence on TULIP, the Dystonia Coalition, a new backbone, or a new labeling frontend for the weekend.

The demo may show observable movement measurements and a clinician-approved *research prototype* only with transparent provenance. Any clinical deployment requires representative patient videos, independent clinician labels, prespecified evaluation, privacy review, and human approval for the stated use.

## 10. Ideal hackathon workflow demo

1. Run a clip labeled **Parkinson's finger-tapping task demonstration** through the existing CV branch and display its actual tap measurements and quality result.
2. Run a separate clip labeled **essential-tremor-relevant postural hold task demonstration** through the existing CV branch and display its actual frequency/amplitude measurements and quality result. Neither clip is presented as proof of disease recognition.
3. The clinical researcher chooses a writing sign, phrase, and camera view. Run a writing clip through the new posture feature if it has been implemented and inspected; otherwise show the proposed feature and the capture/labeling work still needed.
4. Show one linked visit report: the two reused feature groups, any new writing observation, source versions, and quality status. The clinician checks a highlighted writing frame and gives a correction. Droid turns that correction into a proposed feature/rubric revision and a `data_needed` plan. A trained head appears only if approved labels and participant-separated evaluation actually exist.

### Patient-side features in the demo

- If live capture is implemented: three short task prompts and progress through tapping, postural hold, and writing in the existing check-in.
- Existing quality feedback where available, with task-specific retake guidance for the new writing view if that feature is built.
- Submission confirmation; no unvalidated dystonia score or diagnostic message.

### Clinical researcher-side features in the demo

- A tiered component map or report identifying the existing MediaPipe landmark model, tapping and tremor calculations, and proposed writing feature.
- A linked visit report with raw clips, measured values, quality results, supporting writing frames when available, and module versions.
- A clinician correction recorded against a specific frame and rubric version; Droid can draft the next experiment and list missing labeled data. A model card follows only after an actual training run.
