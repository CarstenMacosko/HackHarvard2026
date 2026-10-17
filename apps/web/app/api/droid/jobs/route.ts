import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { DroidRequestInput, dispatch, ghCommand, githubConfig, newRequestId, recentRuns, type DroidRequest, type DroidRun } from "@/lib/droid";
import { RESEARCHER_NAME } from "@/lib/session";
import type { DroidJob, DroidJobStatus } from "@/lib/types";

function runStatus(r: DroidRun): DroidJobStatus {
  if (r.status !== "completed") return "running";
  return r.conclusion === "success" ? "succeeded" : "failed";
}

/**
 * Droid model requests (droid_jobs) with their live GitHub Actions status. Each poll writes any
 * change (status, run and pull-request links) back to the row, so the registry keeps the
 * outcome after the run has scrolled out of GitHub's recent list.
 */
export async function GET() {
  const db = backend();
  let jobs = await db.droidJobs(20);
  if (!githubConfig()) return NextResponse.json({ configured: false, jobs });
  try {
    const runs = await recentRuns(20);
    for (const job of jobs) {
      const run = runs.find((r) => r.request_id === job.id);
      if (!run) continue;
      const patch: Partial<DroidJob> = { status: runStatus(run), run_id: run.id, run_url: run.url, pr_url: run.pull_request?.url ?? job.pr_url };
      if (patch.status !== job.status || patch.run_url !== job.run_url || patch.pr_url !== job.pr_url) {
        await db.updateDroidJob(job.id, patch);
        Object.assign(job, patch);
      }
    }
    jobs = jobs.map((j) => ({ ...j, pull_request: runs.find((r) => r.request_id === j.id)?.pull_request ?? null }));
    return NextResponse.json({ configured: true, jobs });
  } catch (e) {
    return NextResponse.json({ configured: true, jobs, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Ask Droid to build a model for one measurement of a drafted workflow. */
export async function POST(req: Request) {
  const parsed = DroidRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const request: DroidRequest = { ...parsed.data, request_id: newRequestId(parsed.data.measurement.name), requested_by: RESEARCHER_NAME };
  const db = backend();
  const configured = githubConfig() !== null;
  const at = new Date().toISOString();
  const job: DroidJob = {
    id: request.request_id,
    study_id: request.study_id ?? null,
    module: request.measurement.name,
    request: request as unknown as Record<string, unknown>,
    status: "requested",
    run_id: null,
    run_url: null,
    pr_url: null,
    error: null,
    created_by: RESEARCHER_NAME,
    created_at: at,
    updated_at: at,
  };
  await db.insertDroidJob(job);
  let ref: string | null = null;
  if (configured) {
    try {
      ({ ref } = await dispatch(request));
      await db.updateDroidJob(job.id, { status: "dispatched" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.updateDroidJob(job.id, { status: "failed", error });
      return NextResponse.json({ error: `Could not start the Droid workflow: ${error}` }, { status: 502 });
    }
  }
  await db.insertAudit({
    actor: RESEARCHER_NAME,
    action: "droid.requested",
    entity: "droid_job",
    entity_id: request.request_id,
    detail: { condition: request.condition, measurement: request.measurement.label, media_type: request.media_type, dispatched: configured, ref },
  });
  return NextResponse.json({ request_id: request.request_id, dispatched: configured, ref, request, command: ghCommand(request) }, { status: configured ? 202 : 200 });
}
