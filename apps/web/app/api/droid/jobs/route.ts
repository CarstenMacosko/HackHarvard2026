import { after } from "next/server";
import { NextResponse } from "next/server";
import { currentResearcher } from "@/lib/auth";
import { DroidRequestInput } from "@/lib/droid";
import { runModuleGeneration, startModuleGeneration } from "@/lib/generate-module";
import { backend } from "@/lib/backend";
import { liveIntegrationStatus } from "@/lib/live-keys";
import { researcherName } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Strip bulky fields so the jobs list stays fast to poll. */
function summarizeJob(job: Awaited<ReturnType<ReturnType<typeof backend>["droidJobs"]>>[number]) {
  const progress = job.progress;
  if (!progress || typeof progress !== "object") return job;
  const { source_code: _src, logs, ...rest } = progress;
  return {
    ...job,
    progress: {
      ...rest,
      // Keep a short tail of logs for status context; full source lives on the generate detail route.
      logs: Array.isArray(logs) ? logs.slice(-8) : logs,
    },
  };
}

/** List Droid+Daytona generation jobs from the database. */
export async function GET() {
  try {
    const jobs = (await backend().droidJobs(30)).map(summarizeJob);
    const live = liveIntegrationStatus();
    return NextResponse.json({
      jobs,
      daytona: live.daytona,
      droid: live.droid,
      mode: live.mode,
      droid_exec: live.droid_exec,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load Droid jobs.";
    return NextResponse.json({ jobs: [], error: message }, { status: 500 });
  }
}

/**
 * Start in-process module generation (Factory Droid + Daytona).
 * Results are written to droid_jobs.progress and cv_models — no GitHub Actions.
 */
export async function POST(req: Request) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const parsed = DroidRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  if (parsed.data.media_type !== "video" || parsed.data.measurement.name !== "index_straight_fraction") {
    return NextResponse.json({ error: "The current track evaluator supports index_straight_fraction video candidates only." }, { status: 422 });
  }
  const input = {
    condition: parsed.data.condition,
    name: parsed.data.measurement.label || `Writing posture (${parsed.data.condition})`,
    description: parsed.data.description || `${parsed.data.measurement.label} for ${parsed.data.condition}`,
    measurements: [parsed.data.measurement],
    media_type: parsed.data.media_type,
    study_id: parsed.data.study_id ?? null,
  };
  const actor = await researcherName();
  const job = await startModuleGeneration(input, actor);
  const live = liveIntegrationStatus();
  await backend().insertAudit({
    actor,
    action: "droid.module_requested",
    entity: "droid_job",
    entity_id: job.id,
    detail: {
      condition: input.condition,
      measurement: parsed.data.measurement.label,
      media_type: input.media_type,
      daytona: live.daytona,
      droid: live.droid,
      mode: live.mode,
      via: "builder",
    },
  });
  after(() => runModuleGeneration(job.id, input));
  return NextResponse.json(
    {
      request_id: job.id,
      job_id: job.id,
      dispatched: true,
      status: job.status,
      daytona: live.daytona,
      droid: live.droid,
      mode: live.mode,
    },
    { status: 202 },
  );
}
