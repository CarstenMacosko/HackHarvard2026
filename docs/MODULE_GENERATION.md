# Droid + Daytona module generation

Live path for researcher-defined assessments: **Factory Droid** drafts a Python `CVModule`, **Daytona** runs ~20 parameter experiments in parallel sandboxes, then the result is **saved to the database** (`cv_models` + `droid_jobs`).

## Demo (no API keys)

1. `npm run dev`
2. Open [/researcher/generate](http://localhost:3000/researcher/generate)
3. Click **Generate with Droid + Daytona**
4. Watch the pipeline + Daytona experiment grid; approve when ready

Without `FACTORY_API_KEY` / `DAYTONA_API_KEY` the same UI runs in **demo mode**: a safe hand-movement template (MediaPipe landmarks + tremor helpers) and local parallel scoring. Models still land in the in-memory / Supabase registry.

## Live keys

Put these in the **repo-root** `.env.local`. `apps/web/next.config.ts` loads that file so the Next app sees them:

```bash
FACTORY_API_KEY=fk-...       # Factory Droid
DAYTONA_API_KEY=dtn_...      # Daytona
DAYTONA_API_URL=             # optional
DROID_EXEC_PATH=             # optional; defaults to node_modules/.bin/droid (@factory/cli)
```

Restart `npm run dev` after editing keys. Confirm with `GET /api/droid/status` (`droid` and `daytona` should be `true`).

- Droid: `@factory/cli` + `@factory/droid-sdk` with explicit `apiKey` / `execPath`
- Daytona: `@daytonaio/sdk` creates a pool of live sandboxes (default concurrency 4); each experiment runs via `process.codeRun` inside a real sandbox, then sandboxes are deleted. With `DAYTONA_API_KEY` set there is **no local score fallback** — failures surface as failed experiments. Each live run compiles and checks the proposed Python `CVModule` source in Daytona before scoring parameters. The parameter scores are still a fixed demo formula; they are **not** video-based quality metrics or clinical validation.

Quick check: `npx tsx apps/web/scripts/smoke-daytona.ts` (from `apps/web`: `npx tsx scripts/smoke-daytona.ts`) should print real UUID `sandbox` ids, not `local-*`, and confirm that Daytona rejects a candidate with the wrong module id.

## Database

| Table | What is stored |
|---|---|
| `droid_jobs` | Request, status, `progress` (steps, logs, Daytona experiment grid) |
| `cv_models` | Registry row: metrics stub, `source_code`, `module_params`, provenance `source: droid` |

On approve: `cv_models.active = true` and `services/cv/app/modules/gen_*.py` is written for the CV service. The web process must share that filesystem with the CV service; approval fails explicitly if the CV package is absent. A separately deployed CV service still needs a module delivery mechanism before participant uploads can use approved modules.

Apply migrations through `0006_model_source.sql` (or `supabase/setup.sql` on a fresh DB).

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/droid/generate` or `/api/droid/jobs` | Start job (background via Next `after`) |
| GET | `/api/droid/generate/[id]` | Poll progress / logs / experiments |
| GET | `/api/droid/jobs` | List jobs from the database |
| POST | `/api/droid/generate/[id]` | `{ "action": "approve" }` → activate model |

## Guardrails

- No clinical labels → interpretable feature extractor + `missing_validation` note
- Approved source only written as `gen_*.py` (gitignored)
- CV registry hot-loads `gen_*` modules for participant analysis
