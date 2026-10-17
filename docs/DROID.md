# Droid: a new CV model for each longitudinal study

A researcher describes what their study should track. Factory Droid builds the measurement model, trains and evaluates it on suitable data, and opens a pull request with the code, the model and its model card for the team to review.

```
Workflow builder (web)                 GitHub Actions: droid-model.yml                         Review
───────────────────────                ───────────────────────────────────────────────          ──────────────
"Plaque psoriasis: track               1. validate the request (droid_request.py)               draft PR:
 scaling weekly…"                      2. droid exec -f .github/droid/new-study-model.md          study.yaml
        │                                 Droid reads the playbook, picks an approach:            (+ module / loader)
 draft: Scaling ⟶ needs a new model       A. new head on an existing module's features            model.json
        │                                 B. new dataset loader (public data, real licence)       model_card.md
 [Generate with Droid] ──POST /api/droid/jobs──► C. new CV module (+ tests, on-device port)       metrics per
        │      (GitHub workflow_dispatch)    trains with the kit: python -m vfcv.run …            skin type
        │                                    or stops honestly: DATA_NEEDED.md                        │
 Model registry → Droid jobs ◄── run status  3. gate: allowed paths only, no media, outputs present   merge ⟶ the
 (runs + PRs, refreshed)                     4. all tests (training, CV service, JS)              registry lists it,
                                             5. commit to droid/model-<id>, open a draft PR       runs on every capture
```

Everything Droid does goes through the training kit ([`training/README.md`](../training/README.md)):
- a model is a spec plus generated outputs, never hand-edited weights;
- every model starts as *needs validation*;
- the workflow's gate (`training/scripts/droid_gate.py`) rejects changes to CI, API routes, migrations, the agent, package manifests or env files, any committed media, and studies that are neither trained nor marked as needing data.

## Why GitHub Actions

`droid exec` (Factory's headless CLI, `@factory/cli` on npm, authenticated with `FACTORY_API_KEY`) needs a machine that can reach factory.ai, the repo and the dataset hosts, and minutes to hours of compute. The web app runs on Vercel functions that time out in seconds, and the cloud sandbox this was built in cannot reach factory.ai. Actions has all of that, keeps the key in an encrypted secret, and turns each model into a reviewable pull request.

## Setup (once, about 5 minutes)

1. **Rotate the Factory key.** It was shared in a chat, so create a new one at app.factory.ai → Settings → API keys and revoke the old one.
2. **Add it as a repository secret:** GitHub → `carstenmacosko/hackharvard2026` → Settings → Secrets and variables → Actions → New repository secret. Name: `FACTORY_API_KEY`. Never put it in the repo, in Vercel or in chat.
3. **Let Actions open pull requests:** Settings → Actions → General → Workflow permissions → choose "Read and write permissions" and tick "Allow GitHub Actions to create and approve pull requests".
4. **Put the workflow on the default branch.** GitHub only offers `workflow_dispatch` for workflows on the default branch, so merge the PR that adds `.github/workflows/droid-model.yml`.
5. **Connect the web app (optional, for the button):** create a fine-grained personal access token limited to this repository, with *Actions: Read and write*, *Pull requests: Read*, *Contents: Read* and *Metadata: Read*. In Vercel → Project → Settings → Environment Variables, add:
   - `GITHUB_TOKEN`: the token
   - `GITHUB_REPOSITORY`: `carstenmacosko/hackharvard2026`
   - `DROID_WORKFLOW_REF` (optional): the branch Droid starts from (default: the repository's default branch)

   Redeploy. The Model registry's **Droid jobs** card then shows "GitHub connected".

Without step 5 the button still works: it records the request and shows the equivalent command, which you can run in a terminal:

```bash
gh workflow run droid-model.yml -f request='{"request_id":"scaling-score-demo1","condition":"Plaque psoriasis","measurement":{"name":"scaling_score","label":"Scaling","unit":"0-4"},"media_type":"photo","description":"Track plaque scaling on elbows and knees weekly."}'
gh run watch    # then review the draft PR it opens
```

## Using it

1. **Researcher → Workflow builder:** describe the condition and click *Draft workflow*.
2. Next to each measurement tagged **needs new model**, click **Generate with Droid**.
3. **Researcher → Model registry → Droid jobs:** the run appears within a few seconds, with a link to its log, then to the draft pull request. A run takes about 10–40 minutes, mostly the first SCIN download and feature extraction; the dataset cache is reused across runs.
4. Review the pull request:
   - Read `model_card.md`: the label's real meaning, metrics against the baseline, the **worst skin-type subgroup**, and how many captures the quality gate excluded.
   - Check the approach Droid chose (summary at the top of the PR).
   - CI has already run the full test suite inside the job.
5. Merge. The next deploy lists the model in the registry as *needs validation*, and it adds its measurement to every new usable capture for its module (or only its study, if a `study_id` was given). Marking it *validated* stays a human decision in the registry, and it is audit-logged.

## What Droid will and won't do

| Situation | What happens |
|---|---|
| The measurement can be learned from existing features (e.g. psoriasis scaling from skin photos) | A study spec on a suitable dataset (A). Minutes. |
| The right labels exist in a public dataset the kit doesn't load yet | A new loader with the dataset's real licence and citation, added to `training/DATASETS.md` (B) |
| The measurement needs new signals (e.g. a new movement task) | A new `CVModule` modelled on `hand_tremor.py`, with tests on synthetic ground truth, optionally an on-device port with parity fixtures (C) |
| No suitable labelled data is available (e.g. PASI-graded photos) | A ready-to-train spec on `dataset: folder` plus `DATA_NEEDED.md`: what to collect, who must label it, and which datasets could be requested. The PR title says *(needs data)*. |

Droid never invents labels, never marks a model validated, and never pushes. The workflow commits only after the gate and the tests pass.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Run fails at "Check the Factory API key" | Add the `FACTORY_API_KEY` repository secret (setup step 2). |
| `Authentication failed` from droid | The key is wrong, revoked or expired; replace the secret. |
| "Resource not accessible by integration" when opening the PR | Setup step 3. The branch is already pushed, so you can open the PR by hand. |
| Button says "GitHub not connected" | Setup step 5, then redeploy. |
| `404` when dispatching | The workflow isn't on the branch in `DROID_WORKFLOW_REF` or the default branch yet (setup step 4), or the token lacks *Actions: Read and write*. |
| Gate fails | Read the job summary. It lists each problem, e.g. a stale model bundle (`python -m vfcv.publish`) or a forbidden path. |
