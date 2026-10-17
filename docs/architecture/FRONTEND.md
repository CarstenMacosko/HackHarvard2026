# Frontend guide

## User experiences

| Area | Routes | Job |
|---|---|---|
| Enrollment | /participant/join | Invite, consent, enrollment |
| Participant home | /participant | Explain the next task |
| Capture | /participant/check-in | Upload/camera, quality feedback, answers, confirmation |
| Participant records | /participant/history, /participant/rewards | History and simulated rewards |
| Research operations | /researcher, /researcher/studies, /researcher/participants | Study navigation |
| Review/provenance | /researcher/review, /researcher/submissions, /researcher/participants/[id] | Adjudication and source inspection |
| Research tooling | /researcher/models, /researcher/generate, /researcher/builder | Inspect models, review writing candidate jobs, and draft protocols |
| Operations | /researcher/audit, /researcher/settings | Audit and system status |

Source: [apps/web/app](../../apps/web/app). Browser algorithms: [packages/cv](../../packages/cv). Some Next.js pages load data on the server; being part of the frontend does not mean every line runs in the browser.

## Capture experience: recommended acceptance criteria

1. Instructions identify body site, duration, framing, and supported-phone setup.
2. A failed capture names the failed check and gives a concrete retake action.
3. Quality-accepted captures require the task's report answers before completion.
4. Confirmation distinguishes received/awaiting review from reviewed.
5. Upload/analysis errors have recovery actions and do not report false success.
6. Show analysis runtime and when only a poster was retained instead of original video.
7. Escalation wording does not promise coordinator notification unless delivery exists.

These are verification/polish targets, not a claim that every screen already satisfies them.

## Researcher experience: recommended acceptance criteria

- Inspect media, checks, patient report, model version, and status together.
- Corrections/rejections require a reason; authenticated attribution remains backend work.
- Experimental scores link to model cards, label sources, baselines, and subgroup results.
- Timeline states consistently distinguish pending, accepted, corrected, and rejected.
- Export matches the documented review-state filter.
- Training/Droid distinguish unconfigured, requested, running, failed, and completed.

## Handoffs

The browser provides capture feedback. The server owns persistence, reward-ledger updates, and review writes. Cookies and hidden controls are not authorization.

Use the [endpoint map](BACKEND.md), [shared contracts](../../packages/shared/src/schemas.ts), and [catalog](../../packages/shared/src/catalog.ts) when changing screen/API behavior.

## Recommended next work

Prioritize capture → retake → pending → reviewed, mobile recording reliability, and clear provenance/model labels. Keep rewards and a second condition brief in the demo. Training, builder, and Droid are optional extensions.
