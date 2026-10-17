# Visual Follow-Up Platform

Remote, clinician-verified visual follow-up for longitudinal studies. Built at HackHarvard 2026.

Participants complete short photo and video check-ins from home **by upload** in the participant portal. The messaging-agent conversation flow is implemented with a local dev adapter; the Photon adapter for live texting is still unfinished.
- Modular computer vision checks each capture **on the participant's device** and gives specific retake instructions when it isn't usable.
- Usable captures are measured, and every result is accepted, corrected or rejected by a clinician on a longitudinal timeline that traces each point back to its source media.
- Researchers can **train and plug in their own measurement models** from labelled captures in the browser, or ask **Factory Droid** to build one for a new study. Droid writes the study spec (or a new CV module), trains and evaluates it on public data with the training kit, and opens a pull request with a model card.
- A simulated reward system is designed to encourage participation; its effect on retention has not been measured.

The three built-in modules are:
- **Parkinson's finger tapping** (video, MediaPipe hand landmarks);
- **hand tremor** (video, a Welch spectrum of hand landmarks);
- **skin photos** (CIELAB redness and affected area, plus a MobileNet image embedding).

Five study models are trained and shipped:
- eczema and psoriasis likelihood, and rough/flaky skin, from 6,500 dermatologist-labelled SCIN photos;
- MDS-UPDRS-style tapping and rest-tremor scores, on synthetic data.

- 🗺️ Team plan, division of labor and timeline: [`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md)
- 🧠 Next steps toward a generalized CV model: [`docs/GENERALIZED_CV.md`](docs/GENERALIZED_CV.md)
- 🚀 Deploying to Vercel: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- 🤖 Droid model generation (setup + flow): [`docs/DROID.md`](docs/DROID.md)
- 🏋️ Training kit, datasets and model cards: [`training/README.md`](training/README.md), [`training/DATASETS.md`](training/DATASETS.md)
- 🔬 Background research: [`idea research/`](idea%20research/)

## Team guide and current scope

Start with the [documentation hub](docs/README.md) for the [feature inventory](docs/product/FEATURES.md), [project strengths and limitations](docs/product/ASSESSMENT.md), [frontend/backend map](docs/architecture/README.md), and [recommended delivery priorities](docs/delivery/ROADMAP.md).

Current boundaries: identities use demo placeholders; hosted persistence and service integrations need verification; the Photon adapter is unfinished; model outputs remain experimental. The recommended demo focuses on one complete capture-to-review flow. See [demo scope and verification](docs/delivery/DEMO.md).

## What's in the app

**Researcher portal** (`/researcher`), a full-width workspace with a sidebar:
- **Overview:** KPIs, weekly completion per study, a quality-gate funnel, participants at risk, recent submissions.
- **Studies:** per-study overview, participants (with invite links), protocol (capture instructions, quality gate, rewards, attached models), and **data export** (long-format CSV/JSON of reviewed results).
- **Participants:** filterable list; each participant has a longitudinal timeline (click any point to see its media, quality checks, patient report and provenance) and their full capture-attempt history.
- **Review queue:** split view with accept / correct / reject; it advances to the next item automatically.
- **Submissions:** every attempt, usable or not, with what the quality gate caught.
- **Model registry:**
  - built-in modules with their on-device and server status;
  - every trained model with its training data, label type, out-of-fold metrics and worst skin-type subgroup, plus a page per model with its model card;
  - **Droid jobs**: runs and the pull requests they opened.
- **Train a model:** fit a ridge-regression head on a module's feature vector from labelled photos or videos (a synthetic demo dataset is built in). See the cross-validated error against a baseline, register the model, and it runs on every new capture.
- **Workflow builder:** drafts a protocol for a new condition from catalog components (Claude, with an offline fallback). Next to each measurement that needs a new model, **Generate with Droid** starts the model build in GitHub Actions.
- **Audit log** and **System status.**

**Participant portal** (`/participant`), mobile-first with a desktop sidebar:
- invite-code **join** flow with consent;
- **check-in** with drag-and-drop or camera capture, on-device quality feedback, a guided retake and patient-report questions;
- **live guided recording** for finger tapping (`components/live-capture.tsx`):
  - the webcam view shows one instruction at a time while the participant sets up ("Too dark: turn on a light or face a window", "Move a little closer", "Show your whole hand to the camera, wrist included"), with the tracked hand drawn over the video;
  - recording is rolling: set-up footage is discarded, the clip locks when tapping starts, and it stops by itself after 10 s;
  - `trim_start_s` marks where the task begins, so the on-device analysis, the server re-analysis and the clinician's player all skip the set-up;
  - guidance is about the capture only (light, framing, distance, steadiness), never about how to tap. The rules live in `packages/cv/src/live.ts`;
- **history**;
- **rewards** with tiers, badges and simulated redemption.

## Repo layout

```
apps/web/            Next.js app: researcher + participant portals, API routes, browser CV client (MediaPipe)
packages/shared/     Shared contracts (zod): Observation, Submission, CvModel, Protocol; rewards engine; ridge models
packages/cv/         On-device CV: TypeScript port of the modules (OpenCV-exact image math), parity-tested vs Python
services/cv/         FastAPI CV service: CVModule registry, quality gates, finger-tapping + eczema modules (reference)
services/agent/      Messaging agent: conversation state machine, Photon 2.0 + dev adapters, scheduler
training/            Training kit: study specs → trained, evaluated models with model cards (SCIN, synthetic, any folder)
supabase/            Postgres schema (RLS) + migrations + synthetic seed
adroit/              Princeton Adroit: dataset download + Slurm training jobs
.github/             CI, and the Droid workflow + playbook that generates study models
docs/                Plan, deploy guide, Droid setup, generalized-CV roadmap
```

## How a capture flows

```
participant ──► browser: @vf/cv module (quality gate → measure → features)  ──► unusable: retake instructions, attempt logged
                         │ usable
                         ▼
               /api/submissions ──► (CV_SERVICE_URL set? re-run reference module on the server: authoritative)
                         │
                         ▼
          ingest: submission + pending observation + custom-model measurements + reward points + audit
                         │
                         ▼
          researcher review queue ──► accepted/corrected results ──► timeline + export
```

The messaging agent follows the same path: services/cv analyses the media, and `/api/cv-callback` performs the ingest.

## Quick start (local)

Prerequisites: Node 20+ and Python 3.12. MediaPipe 1.x needs `libegl1` and `libgles2` on Linux. Supabase CLI is optional.

```bash
cp .env.example .env.local        # everything works with the blanks; fill in as services come online
npm install                       # installs all JS workspaces

# 1. Web app: runs on built-in synthetic data until Supabase env vars are set
npm run dev                       # http://localhost:3000 (fetches the MediaPipe model into public/ first)

# 2. CV service (optional: uploads are analysed on-device without it)
cd services/cv
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt -r requirements-mediapipe.txt
pytest                            # quality gates, kinematics, eczema metrics, parity fixtures, real-video tests
uvicorn app.main:app --reload     # http://localhost:8000/docs  → then set CV_SERVICE_URL=http://localhost:8000

# 3. Messaging agent: a local chat in your terminal plays the patient
cd services/agent
MOCK_CV=1 WEB_URL=http://localhost:3000 npm run dev
#   you> /due                     (agent sends the finger-tapping prompt)
#   you> /video dark.mp4          (mock CV fails it → retry instructions, attempt logged in the web app)
#   you> /video good.mp4          (accepted → report questions → points from the web app's ledger)
```

Demo shortcuts: `/participant/view-as?id=p_001` (Parkinson's tapping, video), `?id=p_201` (rest tremor, video) and `?id=p_101` (eczema, photo). Invite codes `PD-006J`, `TR-204J` and `AD-106J` are unused, so you can test joining.

### Training kit (study models)

```bash
pip install -r training/requirements.txt          # CV service deps + MediaPipe + PyYAML
cd training
python -m vfcv.run studies/* --check              # validate every study spec
python -m vfcv.run studies/tremor_updrs_synthetic # train one (writes model.json + model_card.md, refreshes the web bundle)
python -m pytest -q
```

### Supabase

The table design, storage layout and full DDL are in [`docs/DATABASE.md`](docs/DATABASE.md). The web app and the messaging agent both persist there; the CV service stays stateless.

```bash
# fresh project: paste supabase/setup.sql into the SQL editor, or with the CLI:
supabase link --project-ref <ref>
supabase db push                                             # supabase/migrations 0001–0004
psql "$DATABASE_URL" -f supabase/seed.sql                    # studies, protocols, participants, open check-ins
psql "$DATABASE_URL" -f supabase/seed_demo.sql               # optional: six weeks of synthetic history
supabase/test/run.sh                                         # database tests on a throwaway local Postgres
```

Then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for the web app, and the URL plus the service role key for the agent. Media goes to the private `media` bucket under `studies/<study>/<participant>/`; large videos upload directly to storage through signed URLs.

## Deploy

| Piece | Command / host |
|---|---|
| Web | **Vercel**, root directory `apps/web`. Step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| CV | `cd services/cv && modal deploy modal_app.py` (or the Dockerfile on Railway); set `CV_SERVICE_URL` on web + agent |
| Agent | **Railway** service from `services/agent`, start command `npm start`, `AGENT_CHANNEL=photon`, `WEB_URL=<vercel url>` |

## Tests

```bash
npm test                          # rewards + ridge models + bundled models (shared), on-device CV parity (cv), agent
cd services/cv && pytest          # Python modules, API, real MediaPipe on synthesized tapping and tremor videos, fixture freshness
cd training && pytest             # ridge parity with TypeScript, specs, dataset parsers, Droid request + gate
```

The on-device port in `packages/cv` reproduces OpenCV's integer colour conversions, bit-exact Gaussian blur, software cube root, and SciPy's Savitzky–Golay filter and peak finding. `packages/cv/test/parity.test.ts` checks every quality value, measurement and feature against fixtures exported by the Python modules, and the Python suite fails if those fixtures go stale.

## Adding a new condition module

1. Add a `CVModule` subclass in `services/cv/app/modules/` (see `base.py`) that implements `prepare`, `quality_checks` and `measure` (returning measurements and a feature vector). Decorate it with `@register` and import it in `registry.py`.
2. If it should run on-device, port it to `packages/cv/src/`, add cases to `app/parity.py`, and run `python scripts/export_parity_fixtures.py`.
3. Add a `TaskConfig` (instructions, quality criteria, report questions, measurements) to the study protocol, and add any reusable components to `packages/shared/src/catalog.ts` so the workflow builder can propose them.
4. Or skip the code: train a head on an existing module's features in **Train a model**, or write a study spec for the training kit.
5. Or ask Droid: **Workflow builder → Generate with Droid** does steps 1–4 in GitHub Actions and opens a pull request ([`docs/DROID.md`](docs/DROID.md)).

## Disclaimer

This is a hackathon prototype. Measurements are **not clinically validated**, and every result carries its validation status. All demo data is synthetic or comes from consenting team members. It is not for use with real patients without the consent, security and validation work described in the PRD (§7).

MIT licensed.
