# Droid + Daytona module generation

Factory Droid drafts a study-specific CV analyzer; Daytona runs parameter experiments in sandboxes. Results are stored in **Supabase / demo DB** (`droid_jobs`, `cv_models`) — there is no GitHub Actions path.

See **[MODULE_GENERATION.md](MODULE_GENERATION.md)** for the live demo, API, and env keys (`FACTORY_API_KEY`, `DAYTONA_API_KEY`).

## Flow

```
Researcher (/researcher/generate or builder → Generate with Droid)
        │
        ▼
POST /api/droid/jobs  (or /api/droid/generate)
        │
        ├─ droid_jobs row (progress, logs, Daytona experiments)
        ├─ Factory Droid drafts Python CVModule (or template fallback)
        ├─ Daytona ~20 parallel sandboxes score params
        └─ cv_models row with source_code + module_params (inactive)
                │
                ▼
        Researcher approves → active=true, gen_*.py written for CV service
```

## Rules

- New models start as `reusable_needs_validation` and `active: false`.
- Without clinical labels, the module is an interpretable feature extractor only.
- Never invent clinical scores.
