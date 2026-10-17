# Recommended delivery roadmap

Snapshot: 2026-10-17, commit `43d0c2f`. These are proposed tasks/verification, not completed work. Owners use A/B/C/D from the [team plan](../HACKATHON_PLAN.md); assign actual people as a team.

## P0: prove one complete demo flow

| ID | Task | Suggested owner | Done when |
|---|---|---|---|
| P0-1 | Choose one primary task and freeze demo scope | Team, B + D | Instructions, usable/unusable fixtures, outputs, and claims are agreed |
| P0-2 | Verify hosted storage/persistence | A | Capture, intended original media, review, and audit survive restart/new session |
| P0-3 | Rehearse capture → retake → review → export | B + A + D | Failed attempt logged; valid retry creates pending observation; review/export match |
| P0-4 | Make provenance visible | B + A | Runtime, fallback, retained media kind, pending/reviewed state are accurate |
| P0-5 | Decide what messaging can demonstrate | C | Real attachment/reply proven, or portal/dev messaging clearly identified |
| P0-6 | Record evidence and backup demo | Team | Commit, mode, recording, observed results, and limits documented in [DEMO.md](DEMO.md) |

Choose the task before recording fixtures. Establish persistence before claiming a deployed full flow. Optional features should not delay this sequence.

## P1: complete operational integration

| ID | Task | Suggested owner | Done when |
|---|---|---|---|
| P1-1 | Replace demo identities/enforce study access | A + B | Authenticated sessions; unrelated study data, media, and mutations denied |
| P1-2 | Complete review persistence | A | Authenticated reviewer, decision, reason, corrections, history, and audit persist |
| P1-3 | Complete Photon attachment delivery | C + A | Real attachment durably stored, analyzed, ingested, acknowledged with ledger balance |
| P1-4 | Persist conversation/scheduling | C + A | Restart resumes state; no duplicate prompts; preferred time/quiet hours respected |
| P1-5 | Verify retries/concurrency | A + C | Duplicate callbacks, simultaneous captures, partial failures avoid duplicate rewards/inconsistent records |
| P1-6 | Define server-analysis policy | A + D + B | Allowed fallback is explicit; provenance recorded; server-verified labels cannot survive browser fallback |
| P1-7 | Deliver coordinator escalation | A + C | Escalation reaches the chosen queue/channel with delivery state |

Identity/access work is a prerequisite to use beyond controlled synthetic/consented-team demonstrations.

## P2: strengthen scientific/product evidence

| ID | Task | Suggested owner | Done when |
|---|---|---|---|
| P2-1 | Validate the actual clinical target | D + clinical collaborator | Held-out clinician-rated data, appropriate baseline, and uncertainty support the intended claim |
| P2-2 | Evaluate robustness/subgroups | D | Lighting, motion, device, skin-type results include sample sizes/exclusions/failures |
| P2-3 | Measure user/reviewer effort | A + B | Completion, retakes, review time, and correction/rejection reasons observed |
| P2-4 | Verify Droid end to end | D + A | Configured workflow produces reviewable PR, card, metrics, permitted changes, passing checks |
| P2-5 | Add another condition with evidence | B + D | Framework reuse, justified labels, and evaluation plan |

## Defer until the core flow is reliable

Additional conditions, reward expansion, broad model automation, and nonessential dashboard polish. A second condition or Droid can be a short extension after the primary flow.

## Recording completion

For each item, link a PR/commit, checker, environment mode, observed outcome, and remaining limits. Dev-adapter tests do not establish live messaging; synthetic accuracy does not establish clinical validation.
