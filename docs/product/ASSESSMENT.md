# Project assessment and recommendations

## Recommended positioning

A remote study follow-up platform that helps participants submit usable photos and videos, and helps researchers review traceable observations over time.

The strongest current demonstration is capture → quality feedback → guided retake → pending observation → clinician review → timeline and export. Automated clinical scores and model generation remain experimental extensions.

## Strengths

| Strength | Why it matters | Evidence or next proof |
|---|---|---|
| Clear participant-to-researcher workflow | Judges can follow a concrete task and its result | [Feature inventory](FEATURES.md); rehearse one complete deployed flow |
| Immediate quality feedback | Participants can correct unusable captures | Browser CV in [packages/cv](../../packages/cv); measure retry success |
| Source-media traceability and human review | Researchers can inspect evidence behind measurements | Review queue and timelines; verify original media is available |
| Substantive engineering | Browser/server parity, shared contracts, ingest, and training | [Architecture](../architecture/README.md); software tests support implementation claims |
| Modular study design | New protocols can reuse components | Training kit and catalog; clinical validation remains separate |

Reduced dropout, better retention, and lower reviewer workload are hypotheses. Rewards and dashboards do not prove those outcomes by themselves.

## Limitations supported by current evidence

| Consideration | Current evidence | Product implication |
|---|---|---|
| Weak dermatology predictive gains | Eczema MAE 0.193 vs mean baseline 0.199, AUC 0.639; psoriasis MAE 0.059 vs 0.060, AUC 0.616 | Present these as experimental supporting signals |
| Target does not measure treatment response | SCIN labels are differential diagnoses, without EASI/SCORAD or PASI severity grades | Condition likelihood does not establish improved severity |
| Uneven skin-type results | Eczema FST6 AUC 0.337 on 51 included photos | Small samples make estimates uncertain; broad reliability is unproven |
| Synthetic movement labels | Tremor scores apply rules to generated tracks and assume a 10 cm hand | Synthetic accuracy does not establish agreement with clinician-rated videos |
| Capture variability | Camera shake is a documented tremor confounder | Use a supported phone; test realistic recording conditions |
| Incomplete messaging | Photon start/send throw “not implemented” | A portal demo does not establish completed live texting |
| Demo infrastructure and identities | Demo sessions, in-memory agent store, optional Supabase | Verify persistence, identity, and study isolation separately |
| Broad scope and review burden | Multiple conditions, rewards, portals, training, builder, Droid | Focus the demo; measure staff effort before claiming savings |

Sources: [eczema model card](../../training/studies/eczema_likelihood_scin/model_card.md), [psoriasis model card](../../training/studies/psoriasis_likelihood_scin/model_card.md), [tremor model card](../../training/studies/tremor_updrs_synthetic/model_card.md), [Photon adapter](../../services/agent/src/adapters/photon.ts), [sessions](../../apps/web/lib/session.ts), [agent store](../../services/agent/src/store.ts).

## Recommendations

1. Finish one deployed capture-to-review flow before expanding conditions.
2. Lead with usable data collection, guided retakes, and traceable review.
3. Show analysis runtime, original-media versus poster retention, and pending versus reviewed state.
4. Claim live Photon texting only after proving a real attachment and reply; identify dev messaging as simulated.
5. Present baselines, subgroup results, and label sources alongside model scores.
6. Make clinician-rated validation and workload evaluation the next evidence milestone.
7. Keep Droid as optional research tooling after the core flow works.

## Evidence to collect next

| Question | Suggested measure |
|---|---|
| Can participants submit usable captures? | First-attempt acceptance and success after guided retakes |
| Is participation easier? | Completion time, abandonment, and help requests |
| Does review save staff time? | Review time and correction/rejection rate against the existing process |
| Are measurements repeatable? | Repeated captures across devices, lighting, framing, and skin-type groups |
| Do scores reflect the intended clinical construct? | Held-out clinician-rated data, participant-grouped splits, baselines, and uncertainty |
| Is the deployed path reliable? | Completion, persistence after restart, correct source media, and duplicate-event behavior |

Do not replace missing observations with invented improvements or clinical claims.
