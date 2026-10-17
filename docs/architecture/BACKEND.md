# Backend and service guide

## Web server

[API routes](../../apps/web/app/api) contain Next.js handlers. [Server helpers](../../apps/web/lib) contain persistence, ingestion, sessions, and media orchestration.

| Endpoint/area | Responsibility | Boundary |
|---|---|---|
| POST /api/submissions | Validate task/report, save media, select analysis, ingest | Server re-analysis can fall back to browser output |
| POST /api/uploads | Direct storage upload target | Requires configured storage |
| /api/media/... | Deliver media or poster | Study-member access remains work in the existing plan |
| POST /api/cv-callback | Ingest analyzed messaging attempts; return ledger | Secret checked when configured; use a non-default secret in hosted setup |
| POST /api/reviews | Review state, corrections, audit | Demo reviewer; separate reviews-table writes remain TODO |
| /api/export | Reviewed-data export | Verify review-state filter |
| /api/models, /api/models/[id] | Read/manage existing models | Browser model registration was removed; management does not confer clinical validity |
| POST /api/builder/draft | Draft protocol | Catalog and optional model provider |
| GET/POST /api/droid/jobs | List/request generation jobs | GitHub/Actions/Factory configuration required |
| /api/rewards/redeem | Simulated redemption | No real payment/fulfillment |

Use handlers/shared schemas for exact request and response validation.

## Ingest and persistence

[ingest.ts](../../apps/web/lib/ingest.ts) is shared by web and messaging:

1. Resolve scheduled task and attempt count.
2. Record quality outcome and escalation state.
3. For usable captures, create a pending observation and apply eligible custom models.
4. Award simulated rewards for an eligible scheduled check-in; update its completion state.
5. Save submission and audit.

These are sequential writes. Do not assume one atomic transaction or database-enforced idempotency. Verify concurrent captures, duplicate callbacks, and partial failures before relying on retries.

[backend.ts](../../apps/web/lib/backend.ts) selects Supabase when URL and server service-role key exist; otherwise it uses the demo backend. [media.ts](../../apps/web/lib/media.ts) uses private storage or bounded in-memory media.

A privileged service-role credential means database policies alone do not establish per-request study authorization. Demo data/media are not durable across restarts or separate server instances.

## Python analysis service

[main.py](../../services/cv/app/main.py) exposes:

| Method/route | Purpose |
|---|---|
| GET /health | Health |
| GET /modules | Module catalog |
| POST /analyze | Analyze media by URL |
| POST /analyze/upload | Analyze multipart upload |

The registry composes preparation, quality checks, and measurements. Python is the reference implementation; packages/cv provides browser algorithms with parity fixtures.

Original-media server analysis is attempted on eligible paths. Failure can use browser analysis; poster-only/failed-attempt paths skip re-analysis. Any future server-verified policy must enforce and record that state explicitly.

## Messaging service

[Agent source](../../services/agent/src) separates adapters, conversations, CV client, store, and scheduler.

- Dev adapter exercises local conversations; Photon start/send are unimplemented.
- Conversation/participant state is in memory.
- Scheduler uses elapsed cadence; preferred time and quiet hours remain TODO.
- Callback returns the web ledger balance for confirmations.

Complete attachment handling, durable state, duplicate-event handling, and scheduled delivery as an integrated milestone.

## Configuration and hosting

Use [.env.example](../../.env.example), [deployment](../DEPLOY.md), and [Droid setup](../DROID.md). Planned hosts: Vercel web, Supabase data/auth/storage, Modal or Railway CV, Railway agent. A hosting guide does not prove a live deployment works.

[Roadmap](../delivery/ROADMAP.md) · [Feature inventory](../product/FEATURES.md)
