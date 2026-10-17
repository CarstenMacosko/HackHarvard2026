# Writing-posture CV demo

The current generated-module path targets **index-finger straightening during writing**. The CV service has an implemented `writing_posture@0.1.0` module. Factory Droid drafts a separate source candidate; Daytona runs the production `writing_posture_core.py` feature on landmark tracks while checking the draft's Python syntax and `CVModule` contract. The draft is **not executed as a full module**, deployed to the CV service, or registered as a trained model. Review only marks the job as reviewed.

## Capture protocol

Use a fixed side-view camera with the writing hand and index finger in frame. The participant holds a pen still for two seconds, then writes the same short phrase for at least four seconds. A shorter capture or poor index landmark visibility fails quality checks. The feature reports mean index PIP angle, fraction of writing frames with angle at or above a provisional 160° threshold, visibility, and a representative frame timestamp. These are descriptive measurements, not a dystonia diagnosis or validated trial endpoint.

## Run locally

1. Start the web app with `npm run dev` and open `/researcher/generate`.
2. Edit the assessment description, measurement label, or unit, then generate. The feature name remains `index_straight_fraction` because that is the implemented evaluator.
3. Without `FACTORY_API_KEY`, a writing-posture template is drafted. Without `DAYTONA_API_KEY`, the same Python feature checks run in local Python workers. No numerical score is invented.
4. The default cases are **synthetic**: straight, bent, short, and index-obscured landmark tracks. The grid changes the provisional angle and visibility thresholds. Its pass fraction is a software fixture result, never clinical accuracy.
5. Review the candidate in its job record. “Mark candidate reviewed” does not add a `cv_models` row or activate a CV module.

For cloud execution, set `FACTORY_API_KEY` and `DAYTONA_API_KEY` in the repository root `.env.local`, restart the web app, and check `/api/droid/status`. Each Daytona experiment uses `process.codeRun` in a Python sandbox, and sandboxes are deleted at the end. A failed cloud run stays failed; there is no score fallback. Run `npx tsx scripts/smoke-daytona.ts` from `apps/web` to check live sandbox IDs and candidate-contract rejection.

To replace synthetic cases, run `python -m scripts.export_landmark_case --input writing.mp4 --case-id capture-1 --output /tmp/writing-cases.json` from `services/cv`, then set `CV_EVAL_TRACK_MANIFEST=/tmp/writing-cases.json` for the web process. This command also accepts `.npz` hand tracks. The JSON manifest is a nonempty array of `{ "id", "fps", "frames" }`, where `frames` is shaped `[frame][21][2]` and `null` denotes an unavailable coordinate. Combine cases into one JSON array as needed. Optional `expected_accept` and `expected_straight` fields are software assertions; omit them for unlabeled captures. Video conversion requires the CV service's MediaPipe dependency. Keep consent and source information with the capture outside the manifest. Real unlabeled tracks can check runtime behavior and quality coverage, but cannot measure clinical accuracy.

## Linked visit report

From `services/cv`, with its Python requirements installed:

```bash
python -m scripts.visit_report --visit-id visit-1 --participant-id participant-1 --captured-at 2026-10-17T14:00:00Z \
  --task finger_tapping=/path/tapping.npz \
  --task hand_tremor=/path/tremor.npz \
  --task writing_posture=/path/writing.npz \
  --output /tmp/visit-1.json
```

The report links all three observations by visit ID, participant ID, and study ID. It records module versions, quality failures, measurements, features, and missing capture reasons. Supply the actual visit timestamp with `--captured-at`; otherwise the report explicitly marks observation timestamps as analysis-time fallbacks. Video paths also work when MediaPipe is installed. This is a research review report, not a patient-facing interpretation. The participant browser check-in currently supports the existing tapping/tremor flow; writing posture is available through the CV service and this report CLI.

## API and storage

`POST /api/droid/generate` or `/api/droid/jobs` starts an index-straightening video candidate job. `GET /api/droid/generate/[id]` and `/api/droid/jobs` return progress. `POST /api/droid/generate/[id]` with `{ "action": "review" }` records a reviewed candidate. Candidate source and track-check results live in `droid_jobs.progress`. `cv_models` contains previously trained models; the generation flow creates no placeholder trained row. The offline `training/vfcv` kit remains available for later labeled research.

Legacy Droid rows created by the earlier placeholder path remain in existing databases for audit history. Zero-fold Droid placeholders are blocked from contributing patient measurements or being activated through the model API, and the registry flags them as legacy placeholders.
