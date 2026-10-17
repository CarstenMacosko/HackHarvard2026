# Visual Follow-Up Platform

Remote, clinician-verified visual follow-up for longitudinal studies. Built at HackHarvard 2026.

Patients complete short photo and video check-ins **by text**, through a Photon 2.0 messaging agent.
- Computer vision checks each capture and measures it.
- When a capture isn't usable, the agent explains how to retake it.
- Clinicians review every result on a longitudinal timeline that traces each point back to its source media.
- A simulated reward system keeps participation high.

The two starting modules are **Parkinson's finger tapping** (video) and **atopic dermatitis skin photos**.

- 📄 Product requirements: see the PRD in the project brief
- 🗺️ **Team plan, division of labor and the 33-hour timeline: [`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md)**
- 🔬 Background research: [`idea research/`](idea%20research/)

## Repo layout

```
apps/web/            Next.js app: researcher portal (/researcher) + participant portal (/participant)
packages/shared/     Shared contracts (zod): Observation, Protocol/TaskConfig, rewards engine, CV component catalog
services/cv/         FastAPI CV service: CVModule registry, quality gates, finger-tapping + eczema modules
services/agent/      Messaging agent: conversation state machine, Photon 2.0 + dev adapters, scheduler
supabase/            Postgres schema (RLS) + synthetic seed
adroit/              Optional Princeton Adroit Slurm job (skin segmentation fine-tune)
docs/                Hackathon plan
```

## Quick start (local)

Prerequisites: Node 20+, Python 3.11 or 3.12 (MediaPipe has no 3.13 wheels yet), and optionally the Supabase CLI.

```bash
cp .env.example .env.local        # everything works with the blanks; fill in as services come online
npm install                       # installs all JS workspaces

# 1. Web app: runs on built-in synthetic data until Supabase env vars are set
npm run dev                       # http://localhost:3000

# 2. CV service
cd services/cv
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt -r requirements-mediapipe.txt
pytest                            # synthetic-signal tests
uvicorn app.main:app --reload     # http://localhost:8000/docs

# 3. Messaging agent: a local chat in your terminal plays the patient
cd services/agent
MOCK_CV=1 npm run dev             # or CV_SERVICE_URL=http://localhost:8000 to use the real CV service
#   you> /due                     (agent sends the finger-tapping prompt)
#   you> /video blurry.mp4        (mock CV fails it → retry instructions)
#   you> /video good.mp4          (accepted → report questions → reward)
```

### Supabase

```bash
supabase link --project-ref <ref>
supabase db push                  # applies supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy

| Piece | Command / host |
|---|---|
| Web | **Vercel**, root directory `apps/web`. Step-by-step: [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| CV | `cd services/cv && modal deploy modal_app.py` (or deploy the Dockerfile on Railway) |
| Agent | **Railway** service from `services/agent` with start command `npm start`, `AGENT_CHANNEL=photon` |

## Tests

```bash
npm test                          # shared rewards engine + agent conversation state machine
cd services/cv && pytest          # CV quality gates, tap kinematics, eczema metrics, API
```

## Adding a new condition module

1. Add a `CVModule` subclass in `services/cv/app/modules/` (see `base.py`) that implements `prepare`, `quality_checks` and `measure`. Decorate it with `@register` and import it in `registry.py`.
2. Add a `TaskConfig` (instructions, quality criteria, report questions, measurements) to the study protocol.
3. Add any new reusable components to `packages/shared/src/catalog.ts` so the workflow builder can propose them.

## Disclaimer

This is a hackathon prototype. Measurements are **not clinically validated**, and every result is tagged with its validation status. All demo data is synthetic or comes from consenting team members. It is not for use with real patients without the consent, security and validation work described in the PRD (§7).

MIT licensed.
