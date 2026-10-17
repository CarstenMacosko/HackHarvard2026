# Feature inventory

Snapshot: 2026-10-17, commit `43d0c2f`. Implementation, deployment, and clinical validity are separate.

- **Implemented:** code exists; verify the intended deployed path.
- **Partial:** important integration or persistence work remains.
- **Experimental:** useful for research/demo; clinical performance is unproven.
- **Planned:** recommended work without a completion claim.

| Feature | User benefit | Frontend/channel | Backend/shared implementation | Status and boundary |
|---|---|---|---|---|
| Invite join and consent | Enter a study | /participant/join | Participant/study backend, sessions | Partial: demo identity; phone OTP remains work |
| Photo/video check-in | Submit from home | /participant/check-in, browser CV | POST /api/submissions, uploads/media | Implemented; rehearse mobile and hosted uploads |
| Quality checks and retakes | Fix unusable captures | packages/cv, capture feedback | Python reference modules, ingest logs | Implemented; capture quality is not clinical accuracy |
| Repeated-failure escalation | Identify people needing help | Retry feedback, submissions view | Ingest escalation flag | Partial operationally: a flag does not prove notification delivery |
| History | See prior check-ins | /participant/history | Queries/backend | Implemented; distinguish quality acceptance and review |
| Points, streaks, badges, redemption | Encourage participation | /participant/rewards | Shared rewards, ledger, redemption API | Implemented simulation; retention benefit unmeasured |
| Overview, studies, participants | Monitor activity | /researcher, studies, participants | Queries, Supabase/demo backend | Implemented; verify hosted access and data |
| Accept/correct/reject | Adjudicate observations | /researcher/review | POST /api/reviews | Partial: observation/audit writes exist; real reviewer and separate reviews rows remain work |
| Timeline and source media | Inspect evidence | /researcher/participants/[id] | Queries/media delivery | Implemented; some captures may retain a poster instead of original video |
| Reviewed-data export | Analyze reviewed records | Study export controls | /api/export | Implemented; verify review filters and values |
| Live texting | Participate by text | Photon adapter | Conversation, CV client, callback | Partial: dev adapter works locally; Photon unimplemented |
| Scheduled prompts | Remind participants | Agent messages | Scheduler/store | Partial: in-memory state; preferred time/quiet hours remain work |
| Tapping/tremor measurements | Extract movement features | Browser MediaPipe/CV | Python modules, optional server analysis | Implemented algorithms; clinical scores experimental |
| Skin-photo analysis | Extract color/texture features | Browser photo CV | Python module/image embeddings | Experimental clinical interpretation |
| Five bundled models | Demonstrate study predictions | Registry/capture results | Shared models, training/studies | Experimental: SCIN likelihood/texture and synthetic movement labels |
| Offline model training kit | Fit a study-specific head after labels are obtained | CLI only | training/vfcv | Available for future research; researcher browser training removed |
| Protocol drafting | Assemble proposed workflows | /researcher/builder | Builder API/catalog, optional provider | Implemented with offline fallback; needs human review |
| Generate with Droid | Draft an index-straightening CV candidate | /researcher/generate, builder | Droid draft, Daytona/local landmark checks, droid_jobs | Candidate review only; no trained model or deployment |
| Writing posture | Measure index-finger angle during a pen hold and repeated phrase | CV service and visit CLI | writing_posture module and shared hand landmarks | Experimental descriptive feature; browser capture integration pending |
| Real identity/study isolation | Restrict access | Login/session experience | Authorization, media access, authenticated review | Planned completion; current identities are demo placeholders |

## State terminology

A **quality-accepted submission** passed capture checks. It can create a **pending observation** and earn simulated points for an eligible scheduled check-in, before clinician review.

A **clinician-reviewed observation** is accepted, corrected, or rejected through review. Even clinician acceptance does not establish scientific model validation.

Rewards are intended to be awarded once per scheduled check-in. Concurrent captures and duplicate callbacks still require verification of database-level guarantees.

[Frontend](../architecture/FRONTEND.md) · [Backend](../architecture/BACKEND.md) · [Assessment](ASSESSMENT.md) · [Roadmap](../delivery/ROADMAP.md)
