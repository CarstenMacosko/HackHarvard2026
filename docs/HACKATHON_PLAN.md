# HackHarvard 2026 build plan: Visual Follow-Up Platform

**Team:** 4 people · **Time:** 33 hours · **Tracks:** Photon 2.0 messaging agent + Regeneron "Reinvent Clinical Trials"

## What we are building

Patients in post-treatment follow-up complete short visual check-ins from home, by text.

- A **Photon 2.0 messaging agent** asks for a finger-tapping video (Parkinson's) or a skin photo (eczema).
- The **CV service** checks whether the capture is usable. If it isn't, the agent tells the patient exactly what to change.
- Each accepted capture becomes a structured **observation** with measurements and uncertainty.
- A clinician accepts, corrects or rejects each observation on a **longitudinal timeline**. Every graphed point links back to its source media and quality checks.
- Patients earn **simulated reward points** for usable submissions, with streaks, badges and tiers, to keep retention high.
- A **workflow builder** turns a clinician's description of a new condition into a draft protocol. Each proposed measurement is tagged *validated*, *reusable but needs validation* or *needs a new model*.

## Hosting decision

**Host it, even though the project is temporary.** Every service below has a free tier. A live URL is better for judges than localhost, and Photon needs a reachable agent.

| Piece | Host | Why |
|---|---|---|
| Web app (`apps/web`, Next.js) | **Vercel** | Zero-config for Next.js, with a preview URL on every push |
| Database, auth, media storage | **Supabase** | Postgres + Auth + Storage in one place; free tier |
| CV service (`services/cv`, FastAPI) | **Modal** (`modal deploy modal_app.py`) or Railway (Dockerfile) | Needs Python + OpenCV + MediaPipe |
| Messaging agent (`services/agent`) | **Railway** | Long-lived Node process for the Photon connection and scheduler |

Cloudflare Pages would also work for the web app, but Next.js there needs the OpenNext adapter, which adds friction. Neither Cloudflare nor Vercel can run the Python CV service or the long-lived agent, so those need separate hosts either way.

## Architecture

```
Patient phone ──Photon 2.0 (iMessage/SMS)──► services/agent (Node/TS, Railway)
                                              │  conversation state machine
                                              │  media → Supabase Storage (signed URL)
                                              ▼
                                 services/cv (FastAPI, Modal)
                                   registry → module.prepare → quality gate → measure
                                              │  Observation JSON (shared format)
                                              ▼
                       apps/web /api/cv-callback ──► Supabase Postgres
                                              ▲
                     apps/web (Next.js, Vercel): /researcher/*  and  /participant/*
```

Contracts live in `packages/shared/src/schemas.ts`, mirrored in `services/cv/app/models.py`. **Change both together.**

## Division of labor

| Person | Hours 0–18 | Hours 18–33 |
|---|---|---|
| **A: Platform & researcher portal** | Supabase project, migration, seed, auth. Researcher dashboard, participant list, review queue (accept/correct/reject), longitudinal timeline with drill-down to source media. **Rewards engine backend** (ledger writes, redemption API). | Deploys (Vercel + env vars), audit log view, final integration |
| **B: Participant portal & modular CV integration** | H2–10: join flow (invite code → consent → phone → preferred time), participant home, rewards UI. H10 onward: **modular CV layer**. This covers the `CVModule` interface and registry, the config-driven pipeline (protocol JSON → quality criteria → module → Observation), the eczema module on that interface, and the CV ↔ web wiring (`/api/cv-callback`). | With C: workflow builder. B owns the component catalog (`packages/shared/src/catalog.ts`) and the validation-status logic. |
| **C: Messaging agent** | Photon 2.0 integration (**attend the Fri 4–5 PM Photon workshop**), conversation state machine, media ingest to Supabase Storage, scheduler, reward confirmation texts | With B: workflow builder prompt/LLM drafting. Then the pitch deck + Devpost write-up. |
| **D: CV algorithms** | Quality gates (blur, exposure, framing, duration), finger-tapping kinematics (MediaPipe → tap rate, amplitude, decrement, rhythm), uncertainty estimates, recording consented demo media (team members' own hands/skin) | Robustness table across lighting and devices, optional Adroit job, demo video editing |

**How the CV work splits between B and D:** D writes the algorithms as pure functions, unit-tested on synthetic signals. B writes the framework that composes them. The contract between them is `CVModule`, defined in `services/cv/app/modules/base.py`:

```python
prepare(path)                -> decoded media + features (run once)
quality_checks(prep, crit)   -> list[QualityCheck]   # is this capture usable?
measure(prep, crit)          -> list[Measurement]    # only if every check passed
```

Adding a condition means writing a subclass, decorating it with `@register` and importing it in `registry._load_builtin_modules()`.

## Timeline (33 hours)

| Hours | Everyone works toward |
|---|---|
| **0–2** | Create accounts: Vercel, Supabase, Modal, Railway, Photon, Anthropic. Clone the repo, run everything locally (see README), and freeze the Observation schema. |
| **2–10** | Parallel build. **H10 milestone:** a text to the agent → video upload → CV metrics → an observation row visible in the researcher UI. |
| **10–12** | Integration #1: the full Parkinson's loop, including a failed capture and a guided retry. |
| **12–18** | Sleep in staggered 4-hour shifts. Finish the eczema module, rewards and the participant portal. |
| **18–24** | Workflow builder, review queue polish, realistic 6-week seed histories, deploy everything. |
| **24–28** | Integration #2: both conditions end to end on deployed infrastructure. **Feature freeze at H28.** |
| **28–31** | Record the demo video (~3 min), build the deck (10–12 slides), write up Devpost. The Regeneron judging notes say they consider projects with a GitHub repo (ideally MIT-licensed), a demo video and a deck. |
| **31–33** | Buffer and judging rehearsal. |

## Demo script (≈3 min)

1. **Patient side.** The patient gets a text from the Photon number: *"Time for your weekly finger-tapping check."* They send a dim, shaky video. The agent replies: *"It's too dark… rest your phone against something steady…"* They send a good video and get *"Usable capture ✅"*, two quick questions (medication ON/OFF, which hand), then *"+85 pts · Badge: First check-in."*
2. **Participant portal.** Show the streak, tier progress, badges and a simulated gift-card redemption.
3. **Researcher portal.** The new observation appears in the review queue. The clinician opens it to see the measurements ± uncertainty, the quality checks that passed, the patient report and the model version, then accepts it. The participant timeline shows tap rate over 6 weeks, with OFF-medication points marked. Clicking a point opens its source submission.
4. **Eczema.** The same loop with a skin photo: erythema and affected area trending down with treatment, plotted alongside itch scores.
5. **Workflow builder.** Enter *"Psoriasis: track plaque redness and scaling on elbows and knees weekly."* Droid/Claude drafts the capture instructions, quality criteria and schedule. Erythema is tagged *reusable, needs validation* and scaling is tagged *needs a new model*, along with a validation plan.

## Reward system (simulated, no real money)

- Points are awarded **only for accepted submissions**. This rewards usable data, not attempts.
- Each accepted submission earns a base of 50, plus 10 if on time, plus a streak multiplier (+0.1× per consecutive period, capped at 2×).
- Badges: first check-in, 4- and 10-period streaks, 10 usable submissions.
- Tiers are based on **lifetime** points (Bronze/Silver/Gold/Platinum), so redeeming never demotes anyone.
- Redemption writes a `redemptions` row and returns a fake `DEMO-XXXX-XXXX` code.
- All rules are in `packages/shared/src/rewards.ts` and tested. Researchers set per-study values in the protocol's `rewards` config.

## Princeton Adroit: use it only off the critical path

Neither module needs training. MediaPipe and the colour metrics run on CPU. If D has time after about H14, `adroit/` has a Slurm template for fine-tuning a small skin-segmentation model (SegFormer-b0) on a public dermatology dataset. That model would replace the YCrCb skin mask in `eczema.py`. **The demo must not depend on it**, because of queue wait times. Use public or synthetic data only; never real patient data.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Photon setup takes longer than expected | The agent is channel-agnostic. `AGENT_CHANNEL=dev` runs the same conversation over stdin, so only `adapters/photon.ts` changes. Ask the Photon team at the workshop. |
| MediaPipe install problems (no wheels for Python ≥3.13) | Deploy on Python 3.11 (Modal image / Dockerfile). Locally, use `uv venv -p 3.11`. The signal math is tested without MediaPipe. |
| CV measures look arbitrary to judges | Show the uncertainty, the source media and the validation-status tags. Say plainly that these measurements are *not yet clinically validated* and present the validation plan. |
| Supabase not ready when frontend work starts | The web app runs fully on built-in synthetic data whenever Supabase env vars are missing. |
| Scope creep | Build depth on two conditions plus the builder; everything else is roadmap. Feature freeze at H28. |

## What judges will ask (have the answers ready)

- **"Is this clinically valid?"** Not yet. Each measurement is tagged with its validation status, and the builder outputs a validation plan (labeled data, expert comparison, device/lighting/skin-tone stratification). Clinicians review every result before it enters the record.
- **"Privacy?"** The demo uses synthetic data and consented team-member media only. Real deployment needs consent, access controls, retention rules, audit logs and permitted data flows through Photon and the CV providers (see PRD §7). The schema already has RLS and an `audit_log`.
- **"Why texting instead of an app?"** No install, which matters for older and less mobile patients. Retention depends on low friction: offering alternative data-collection modes is associated with higher retention (86.1% vs 76.3% median, Teague et al. 2018, cited in `idea research/`).
