# Demo scope and verification

## Recommended story

“We help study participants submit usable visual check-ins from home, and give researchers a traceable review workflow.”

One poor capture → specific retake guidance → usable capture → pending observation → clinician review → timeline/export.

Choose finger tapping or skin photos based on actual device reliability. Show another condition, training, or Droid after the primary sequence works.

## Three-minute outline

| Time | Show | Establishes |
|---|---|---|
| 0:00–0:25 | Instructions and unusable capture | Task and capture problem |
| 0:25–1:00 | Feedback, retake, report answers | Guided collection |
| 1:00–1:30 | Confirmation, pending status, simulated points | Ingest, distinct from clinician acceptance |
| 1:30–2:20 | Source media, measurements, quality, version, review | Traceability/adjudication |
| 2:20–2:45 | Timeline and reviewed-data export | Research workflow |
| 2:45–3:00 | Limitations and next validation step | Accurate scope |

Include texting only after a real Photon attachment/reply succeeds. Label terminal/dev-adapter demonstrations as simulated messaging.

## Claims and evidence

| Supported framing | Evidence needed for a stronger claim |
|---|---|
| Guides retakes using capture checks | Improved usable-capture rate in a user study |
| Records experimental movement/skin measurements | Agreement/repeatability against the intended clinical reference |
| Provides review and source traceability | Measured reduction in reviewer time/error |
| Includes simulated participation rewards | Observed retention improvement |
| Trains proposed study models | Appropriate clinical labels and held-out validation per use |

Dermatology likelihood is not severity. Synthetic movement-score accuracy is not patient validation. Clinician review does not scientifically validate a model. See [assessment](../product/ASSESSMENT.md).

## Rehearsal checklist

- [ ] Record commit, chosen task/participant, and synthetic or consented team media.
- [ ] Identify demo/Supabase persistence, browser/server analysis, portal/dev/Photon channel.
- [ ] Verify required services; record deployed URLs without credentials.
- [ ] Submit failing capture; inspect logged attempt and retake guidance.
- [ ] Submit valid capture/answers; verify pending observation and source media.
- [ ] Confirm runtime and original-video versus poster retention.
- [ ] Verify ledger balance and no false promise of another scheduled reward for an extra capture.
- [ ] Review; inspect state, reason, and audit.
- [ ] Match timeline/export against reviewed values.
- [ ] Refresh/new session; verify persistence in the hosted configuration.
- [ ] If claiming texting, prove attachment → analysis → callback → acknowledgement.
- [ ] Record backup video and disclose fallback modes.

## Evidence record

Copy into a PR or team notes after rehearsal:

```text
Date / checker:
Commit:
Primary task and media:
Web / CV / agent environment:
Persistence mode:
Messaging channel:
Analysis runtime and fallback:
Original media or poster:
Observed retake / ingest / review / export outcome:
Evidence links:
Known failures and limitations:
```

This documentation change does not run the deployed product; checklist items are intentionally unmarked.
