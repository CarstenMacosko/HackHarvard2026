# Deploying the web app to Vercel

This takes about 5 minutes and gives the team a shareable URL for both the researcher and participant sides. No environment variables are needed: the app runs on built-in synthetic data until Supabase is configured.

## One-time setup

1. Go to [vercel.com](https://vercel.com), sign in with GitHub and click **Add New → Project**.
2. Import **`carstenmacosko/hackharvard2026`**. If it isn't listed, click "Adjust GitHub App Permissions" and grant access to the repo.
   - Importing the **whole repo** is expected: the web app uses shared code from `packages/shared`. The only required setting is the Root Directory in step 3. Leaving it at the repo root makes the build fail.
   - Connecting your whole GitHub account works, but Vercel can then read every repo. To limit it, go to GitHub → **Settings → Applications → Vercel → Configure** and choose **Only select repositories** → `hackharvard2026`. You can change this any time without affecting deployments.
3. On the configure screen:
   - **Root Directory:** click *Edit* and choose **`apps/web`**.
   - **Framework Preset:** Next.js (detected automatically).
   - Leave Build/Install commands alone. `apps/web/vercel.json` already installs from the repo root (`cd ../.. && npm ci`) so the shared workspace package resolves.
   - **Environment Variables:** none required. Optional:
     - `ANTHROPIC_API_KEY`: the workflow builder drafts with Claude instead of the offline template.
     - `CV_CALLBACK_SECRET`: shared secret the messaging agent sends to `/api/cv-callback`.
     - `GITHUB_TOKEN` + `GITHUB_REPOSITORY`: lets **Generate with Droid** start the model-building workflow ([`DROID.md`](DROID.md)). The Factory API key is *not* a Vercel variable; it lives only in the GitHub secret.
4. Click **Deploy**.

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
| Participant sign-up | `https://<app>/participant/join`, with demo invite codes `PD-006J` (Parkinson's) and `AD-106J` (eczema) |
| View as a demo patient | `https://<app>/participant/view-as?id=p_001` (Parkinson's, video) or `?id=p_101` (eczema, photo) |

## What works with no services configured

The whole app runs on Vercel alone. Participant uploads are analysed **on-device** in the browser: MediaPipe hand tracking for the tapping and tremor videos, and the skin module plus a MobileNet image embedding for photos. Trained models, including the bundled SCIN models, run on every new capture. The MediaPipe runtime and models are copied into `public/mediapipe` at build time.

Large videos (>4 MB) can't pass through a Vercel function. Without Supabase Storage, only a still frame is kept for the researcher, and the measurements still come from the full video, analysed on the phone.

## Known demo-mode limitation

Without Supabase, the app keeps its data in server memory. On Vercel, each serverless instance has its own copy and resets when it goes idle. So a review you submit, a redemption or a new sign-up may vanish or not show up on the next page load. Viewing pages is unaffected.

To make changes stick, and to share data between phones and the projector in a live demo, connect Supabase (about 5 minutes):

1. [supabase.com](https://supabase.com) → **New project** (any region near you; save the database password).
2. **SQL Editor → New query**: paste the whole of [`supabase/setup.sql`](../supabase/setup.sql) (every migration plus the core seed, including the private `media` storage bucket) and click **Run**. Do this once, on a fresh project. For a populated demo, run [`supabase/seed_demo.sql`](../supabase/seed_demo.sql) the same way: six weeks of synthetic check-ins, reviews and rewards, matching the built-in demo data. The table design is documented in [`docs/DATABASE.md`](DATABASE.md).
3. **Project Settings → API**: copy the Project URL, the `anon` public key and the `service_role` secret key into Vercel → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

4. Redeploy. The "Demo data" banner in the researcher header disappears once Supabase is connected, and **Researcher → System status** lists every table with its row count and checks that the bucket is private. For local runs, put the same three values in `.env.local`.
5. The messaging agent (`services/agent`) uses the same project: set `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` where it runs. It then keeps conversations and the message log in Postgres, prompts check-ins from `scheduled_tasks`, and stores inbound photos and videos in the `media` bucket.

Never commit the `service_role` key or paste it anywhere public: it bypasses row-level security.

## The other services (later)

| Service | Host | After deploying, set |
|---|---|---|
| CV (`services/cv`) | `modal deploy modal_app.py`, or the Dockerfile on Railway | `CV_SERVICE_URL` on the agent |
| Messaging agent (`services/agent`) | Railway (start command `npm start`, root `services/agent`) | `WEB_URL=https://<app>`, `AGENT_CHANNEL=photon`, Photon keys, `CV_CALLBACK_SECRET` (same value as on Vercel) |
