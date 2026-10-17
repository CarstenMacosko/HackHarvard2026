# Visual Follow-Up Platform

Remote, clinician-verified visual follow-up for longitudinal studies. Built at HackHarvard 2026.

Participants complete short photo and video check-ins from home, **by text** (Photon 2.0 messaging agent) or **by upload** in the participant portal.
- Modular computer vision checks each capture **on the participant's device** and gives specific retake instructions when it isn't usable.
- Usable captures are measured, and every result is accepted, corrected or rejected by a clinician on a longitudinal timeline that traces each point back to its source media.
- Researchers can **train and plug in their own measurement models** from labelled captures, in the browser.
- A simulated reward system keeps participation high.

The two starting modules are **Parkinson's finger tapping** (video, MediaPipe hand landmarks) and **atopic dermatitis skin photos** (CIELAB redness and affected area).

- 🗺️ Team plan, division of labor and timeline: [`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md)
- 🧠 Next steps toward a generalized CV model: [`docs/GENERALIZED_CV.md`](docs/GENERALIZED_CV.md)
- 🚀 Deploying to Vercel: [`docs/DEPLOY.md`](docs/DEPLOY.md)
- 🔬 Background research: [`idea research/`](idea%20research/)

## What's in the app

**Researcher portal** (`/researcher`), a full-width workspace with a sidebar:
- **Overview:** KPIs, weekly completion per study, a quality-gate funnel, participants at risk, recent submissions.
- **Studies:** per-study overview, participants (with invite links), protocol (capture instructions, quality gate, rewards, attached models), and **data export** (long-format CSV/JSON of reviewed results).
- **Participants:** filterable list; each participant has a longitudinal timeline (click any point to see its media, quality checks, patient report and provenance) and their full capture-attempt history.
- **Review queue:** split view with accept / correct / reject; it advances to the next item automatically.
- **Submissions:** every attempt, usable or not, with what the quality gate caught.
- **Model registry and Train a model:** built-in modules with their on-device and server status. Train a ridge-regression head on a module's feature vector from labelled photos or videos (a synthetic demo dataset is built in), see cross-validated error against a baseline, register it, and it runs on every new capture.
- **Workflow builder:** drafts a protocol for a new condition from catalog components (Claude, with an offline fallback).
- **Audit log** and **System status.**

**Participant portal** (`/participant`), mobile-first with a desktop sidebar:
- invite-code **join** flow with consent;
- **check-in** with drag-and-drop or camera capture, on-device quality feedback, a guided retake and patient-report questions;
- **history**;
- **rewards** with tiers, badges and simulated redemption.

## Repo layout

```
apps/web/            Next.js app: researcher + participant portals, API routes, browser CV client (MediaPipe)
packages/shared/     Shared contracts (zod): Observation, Submission, CvModel, Protocol; rewards engine; ridge models
packages/cv/         On-device CV: TypeScript port of the modules (OpenCV-exact image math), parity-tested vs Python
services/cv/         FastAPI CV service: CVModule registry, quality gates, finger-tapping + eczema modules (reference)
services/agent/      Messaging agent: conversation state machine, Photon 2.0 + dev adapters, scheduler
supabase/            Postgres schema (RLS) + migrations + synthetic seed
adroit/              Optional Princeton Adroit Slurm job (skin segmentation fine-tune)
docs/                Plan, deploy guide, generalized-CV roadmap
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
#   you> /video blurry.mp4        (mock CV fails it → retry instructions, attempt logged in the web app)
#   you> /video good.mp4          (accepted → report questions → points from the web app's ledger)
```

Demo shortcuts: `/participant/view-as?id=p_001` (Parkinson's, video) and `?id=p_101` (eczema, photo). Invite codes `PD-006J` and `AD-106J` are unused, so you can test joining.

### Supabase

```bash
supabase link --project-ref <ref>
supabase db push                  # applies supabase/migrations (0001 schema, 0002 submissions + cv_models)
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Media goes to the private `media` bucket, and large videos upload directly to storage through signed URLs.

## Deploy

| Piece | Command / host |
|---|---|
| Web | **Vercel**, root directory `apps/web`. Step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| CV | `cd services/cv && modal deploy modal_app.py` (or the Dockerfile on Railway); set `CV_SERVICE_URL` on web + agent |
| Agent | **Railway** service from `services/agent`, start command `npm start`, `AGENT_CHANNEL=photon`, `WEB_URL=<vercel url>` |

## Tests

```bash
npm test                          # rewards + ridge models (shared), on-device CV parity (cv), agent state machine
cd services/cv && pytest          # Python modules, API, real MediaPipe on synthesized tapping videos, fixture freshness
```

The on-device port in `packages/cv` reproduces OpenCV's integer colour conversions, bit-exact Gaussian blur, software cube root, and SciPy's Savitzky–Golay filter and peak finding. `packages/cv/test/parity.test.ts` checks every quality value, measurement and feature against fixtures exported by the Python modules, and the Python suite fails if those fixtures go stale.

## Adding a new condition module

1. Add a `CVModule` subclass in `services/cv/app/modules/` (see `base.py`) that implements `prepare`, `quality_checks` and `measure` (returning measurements and a feature vector). Decorate it with `@register` and import it in `registry.py`.
2. If it should run on-device, port it to `packages/cv/src/`, add cases to `app/parity.py`, and run `python scripts/export_parity_fixtures.py`.
3. Add a `TaskConfig` (instructions, quality criteria, report questions, measurements) to the study protocol, and add any reusable components to `packages/shared/src/catalog.ts` so the workflow builder can propose them.
4. Or skip the code: train a head on an existing module's features in **Train a model**.

## Disclaimer

This is a hackathon prototype. Measurements are **not clinically validated**, and every result carries its validation status. All demo data is synthetic or comes from consenting team members. It is not for use with real patients without the consent, security and validation work described in the PRD (§7).

MIT licensed.
