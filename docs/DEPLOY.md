# Deploying the web app to Vercel

This takes about 5 minutes and gives the team a shareable URL for both the researcher and participant sides.

## Critical: set Supabase env vars before a real demo

Without Supabase, each Vercel serverless instance keeps its **own empty in-memory store**. That causes:

- **Writes that disappear** (sign-up, enroll, reviews, captures)
- **Redirect loops** on `/researcher` (old demo auto-login tried to recreate a user that the next instance cannot see)

Set these on **Vercel → Project → Settings → Environment Variables** for **Production** and **Preview**, then **Redeploy**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` secret (**not** the anon key) |

Also run [`supabase/setup.sql`](../supabase/setup.sql) once in the Supabase SQL editor (includes `portal_users`).

Smoke-check after deploy: open `https://<your-app>/api/health` — expect `"mode":"supabase"` and `"ok":true`.

## One-time setup

1. Go to [vercel.com](https://vercel.com), sign in with GitHub and click **Add New → Project**.
2. Import **`carstenmacosko/hackharvard2026`**. If it isn't listed, click "Adjust GitHub App Permissions" and grant access to the repo.
   - Importing the **whole repo** is expected: the web app uses shared code from `packages/shared`. The only required setting is the Root Directory in step 3. Leaving it at the repo root makes the build fail.
   - Connecting your whole GitHub account works, but Vercel can then read every repo. To limit it, go to GitHub → **Settings → Applications → Vercel → Configure** and choose **Only select repositories** → `hackharvard2026`. You can change this any time without affecting deployments.
3. On the configure screen:
   - **Root Directory:** click *Edit* and choose **`apps/web`**.
   - **Framework Preset:** Next.js (detected automatically).
   - Leave Build/Install commands alone. `apps/web/vercel.json` already installs from the repo root (`cd ../.. && npm ci`) so the shared workspace package resolves.
   - **Environment Variables** — for a production demo that keeps data and re-analyses captures, set at least:

     | Variable | Required for | Notes |
     |---|---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | Durable data + media | From Supabase → Project Settings → API |
     | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser uploads to Storage | Same page |
     | `SUPABASE_SERVICE_ROLE_KEY` | Server writes | **Secret** — never expose client-side |
     | `CV_SERVICE_URL` | Server-side CV re-analysis | Public URL after `modal deploy modal_app.py` in `services/cv` |
     | `FACTORY_API_KEY` | Live Droid drafts on `/researcher/generate` | Factory |
     | `DAYTONA_API_KEY` | Live Daytona landmark-track checks | Daytona; optional `DAYTONA_API_URL` |
     | `CV_CALLBACK_SECRET` | Optional agent callbacks | Same value if you run `services/agent` |
     | `ANTHROPIC_API_KEY` | Optional | Offline template is used without it |

     Without Supabase, each Vercel instance keeps its own in-memory copy (not suitable for a shared demo). Without `CV_SERVICE_URL`, captures stay on-device only. Without Factory/Daytona keys, Generate module runs in template mode.
4. Click **Deploy**.

**Function timeouts:** `apps/web/vercel.json` sets `maxDuration` 300s for Droid/Daytona routes and 60s for submissions. That needs a Vercel plan that allows those limits (Hobby caps lower). Researcher → **System status** shows whether Supabase, the CV service, and Factory/Daytona keys are connected.

### Which branch gets deployed

Vercel builds the repo's default branch as "production". Pushes to every other branch get their own **preview URL**, shown on the Deployments tab and on the GitHub commit.

The app currently lives on `claude/hopeful-ritchie-f0dust`. Either:
- merge it into `main`, which makes the production URL show it; or
- in Vercel, go to **Settings → Git → Production Branch** and set it to `claude/hopeful-ritchie-f0dust`, then redeploy.

### Making the links public

The **production** URL is public. **Preview** URLs (every other branch) are behind a Vercel login by default (Deployment Protection), so teammates or judges without access to your Vercel team would hit a login wall. Either:
- make the app's branch the production branch (above), or merge it to `main`; or
- turn off **Settings → Deployment Protection → Vercel Authentication** so preview links are public too.

## Links to share

Replace `<app>` with your deployment URL (e.g. `visual-followup.vercel.app`).

| What | URL |
|---|---|
| Landing page | `https://<app>/` |
| Researcher portal | `https://<app>/researcher` (studies → participant timeline, **Review queue**, **Workflow builder**) |
| Participant portal | `https://<app>/participant` (best on a phone) |
| Participant sign-up | `https://<app>/auth/sign-up` (invite code required) or `/participant/join` |
| Researcher sign-in | `https://<app>/auth/sign-in?role=researcher` |

## What works with no services configured

The whole app runs on Vercel alone. Participant uploads are analysed **on-device** in the browser: MediaPipe hand tracking for the tapping and tremor videos, and the skin module plus a MobileNet image embedding for photos. Trained models, including the bundled SCIN models, run on every new capture. The MediaPipe runtime and models are copied into `public/mediapipe` at build time.

Large videos (>4 MB) can't pass through a Vercel function. Without Supabase Storage, only a still frame is kept for the researcher, and the measurements still come from the full video, analysed on the phone.

## Known demo-mode limitation

Without Supabase, the app keeps its data in server memory. On Vercel, each serverless instance has its own copy and resets when it goes idle. So a review you submit, a redemption or a new sign-up may vanish or not show up on the next page load. Viewing pages is unaffected.

To make changes stick, and to share data between phones and the projector in a live demo, connect Supabase (about 5 minutes):

1. [supabase.com](https://supabase.com) → **New project** (any region near you; save the database password).
2. **SQL Editor → New query**: paste the whole of [`supabase/setup.sql`](../supabase/setup.sql) (every migration plus the core seed, including the private `media` storage bucket) and click **Run**. Do this once, on a fresh project. If the project was set up earlier with the synthetic demo history, also run [`supabase/cleanup_synthetic.sql`](../supabase/cleanup_synthetic.sql) once; it keeps every real upload. The table design is documented in [`docs/DATABASE.md`](DATABASE.md).
3. **Project Settings → API**: copy the Project URL, the `anon` public key and the `service_role` secret key into Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

4. Redeploy. The "Demo data" banner in the researcher header disappears once Supabase is connected, and **Researcher → System status** lists every table with its row count and checks that the bucket is private. For local runs, put the same three values in `.env.local`.
5. The messaging agent (`services/agent`) uses the same project: set `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` where it runs. It then keeps conversations and the message log in Postgres, prompts check-ins from `scheduled_tasks`, and stores inbound photos and videos in the `media` bucket.

Never commit the `service_role` key or paste it anywhere public: it bypasses row-level security.

## CV service + Daytona (production)

### CV service (Modal)

From `services/cv`:

```bash
modal deploy modal_app.py
```

Copy the HTTPS URL Modal prints and set **`CV_SERVICE_URL`** on Vercel (and in local `.env.local`). Redeploy the web app. On **System status**, the CV row should show connected modules (`finger_tapping`, `hand_tremor`, `writing_posture`, `eczema_photo`, …). Participant uploads then re-run through that service after on-device quality feedback.

### Factory Droid + Daytona

1. Set **`FACTORY_API_KEY`** and **`DAYTONA_API_KEY`** on Vercel (same keys as local `.env.local`).
2. Redeploy. Open `/researcher/generate` — the pipeline should report live mode (not template).
3. Jobs write progress to Supabase `droid_jobs` (requires Supabase). Long runs need the 300s function limit above.

Smoke locally (optional): `npx tsx apps/web/scripts/smoke-daytona.ts`.

### Messaging agent (optional)

| Service | Host | After deploying, set |
|---|---|---|
| Messaging agent (`services/agent`) | Railway (`npm start`, root `services/agent`) | `WEB_URL=https://<app>`, `CV_CALLBACK_SECRET` (same as Vercel), Supabase keys |
