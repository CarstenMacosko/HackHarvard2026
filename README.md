# StreamCare

Remote, clinician-verified visual follow-up for longitudinal studies. Built at HackHarvard 2026.

Participants complete short photo and video check-ins from home. Modular computer vision scores each capture, and clinicians verify every result on a longitudinal timeline.

### AI-Powered CV Module Generation and Iteration with Factory Droid

StreamCare uses **Factory Droid** to automatically generate custom computer vision assessment modules from researcher-defined clinical protocols. Droid analyzes the requested measurements and existing CV infrastructure to produce assessment-specific Python code, eliminating the need for researchers to manually develop each test. 
Factory Droid acts as the AI software engineering agent, creating tests in real time..

How it works:
1. Describe an assessment. Researchers specify a condition, assessment requirements, and desired measurements.
2. Assess feasibility with Droid. Factory Droid evaluates whether the requested measurements can reasonably be derived from phone video and supported landmarks. Factory Droid then engages with the researcher in a development loop to create a rigorous and medically accurate procedure that correctly incorporates available computer vision inputs.
3. Generate code with Droid. Droid examines StreamCare's existing modules and produces a candidate Python implementation following the CVModule interface.

## How it works

```
Participant portal          On-device CV                 Backend                      Researcher portal
─────────────────          ───────────                 ───────                      ─────────────────
Join with invite code  →   Quality gate (blur,     →   /api/submissions         →   Review queue
Pick assigned test         light, framing)             (+ optional server           Accept / correct / reject
Live or upload capture     Measure + features          CV re-analysis)              Timeline + export CSV
Patient report form        Retake if unusable          Observation + audit          Studies / participants
```

1. **Researcher** creates a study, invites participants, and assigns capture tasks (finger tapping, tremor, skin photo, clinical forms, or custom modules).
2. **Participant** signs up with an invite code, records a check-in in the browser, and gets live quality feedback before anything is uploaded.
3. **CV modules** run on-device first (`packages/cv`). If `CV_SERVICE_URL` is set, the server re-runs the reference module for an authoritative score.
4. **Clinician** reviews each pending observation (media + measurements), then accepts, corrects, or rejects it. Reviewed data appears on the participant timeline and in CSV/JSON export.

### Built-in modules

| Module | Media | What it measures |
|---|---|---|
| Parkinson's finger tapping | Video | Hand landmarks (MediaPipe), tap rate / amplitude |
| Hand tremor | Video | Welch spectrum of hand landmarks |
| Skin photos | Photo | CIELAB redness, affected area, MobileNet embedding |

Researchers can also **generate new modules** with Factory Droid + Daytona (`/researcher/generate`), or attach trained study models from the offline training kit.

### Portals

| Path | Who | What |
|---|---|---|
| `/` | Anyone | Landing page |
| `/auth/sign-in`, `/auth/sign-up` | Both | Email/password accounts (researcher or participant + invite code) |
| `/researcher` | Study team | Studies, participants, review queue, submissions, CV modules, export, audit, system status |
| `/participant` | Patients | Check-in, history, join flow |

Theme (system / light / dark) is available in both portals and is session-only.

## Repo layout

```
apps/web/          Next.js app — both portals, API routes, browser CV client
packages/shared/   Shared Zod contracts, protocols, rewards helpers, ridge models
packages/cv/       On-device CV (TypeScript), parity-tested against Python
services/cv/       FastAPI reference CV service (optional locally)
services/agent/    Messaging agent (dev adapter; Photon path optional)
training/          Offline training kit → model cards + web bundle
supabase/          Postgres schema, migrations, seed
docs/              Deploy, Droid, architecture, product notes
```

## Prerequisites

- **Node.js 20+**
- **npm** (workspaces)
- **Python 3.12** (CV service / training)
- **Supabase** project (durable data)

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/CarstenMacosko/HackHarvard2026.git
cd HackHarvard2026
cp .env.example .env.local
npm install

# 2. Run the web app
npm run dev
# → http://localhost:3000
```

With empty Supabase vars, the app runs on **in-memory / demo data** (fine for local UI work only). **On Vercel you must set Supabase env vars** or writes will not persist and auth can break — see [`docs/DEPLOY.md`](docs/DEPLOY.md). After deploy, check `/api/health` (`"mode":"supabase"`).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js (fetches MediaPipe assets first) |
| `npm run dev:refresh` | Fresh demo session (clears saved demo state) |
| `npm run build` | Production build of `apps/web` |
| `npm test` | Workspace tests (shared, cv, agent, …) |
| `npm run typecheck` | TypeScript across workspaces |

### Demo paths

- Researcher: sign in / create account with role **researcher**, or follow the demo continue link when running without auth.
- Participant invite codes (seed / demo): try codes from your Supabase seed or the demo studies shown in the researcher UI.

## Environment variables

Copy `.env.example` → `.env.local` at the **repo root**. Symlink or copy into `apps/web/.env.local` if Next does not pick up the root file automatically.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Durable DB + storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser uploads via signed URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes (secret — never expose client-side) |
| `CV_SERVICE_URL` | Server-side CV re-analysis |
| `FACTORY_API_KEY` and `DAYTONA_API_KEY` | Live module generation on `/researcher/generate` |

See [`.env.example`](.env.example) for the full list.

## Supabase

For durable studies, participants, and media:

1. Create a Supabase project.
2. Run [`supabase/setup.sql`](supabase/setup.sql) in the SQL editor (or `supabase db push` with the CLI).
3. Optionally load [`supabase/seed.sql`](supabase/seed.sql).
4. Set the three Supabase env vars above.
5. Create a private Storage bucket named `media` if setup did not already.

Details: [`docs/DATABASE.md`](docs/DATABASE.md).

[MIT Licensed](LICENSE).
