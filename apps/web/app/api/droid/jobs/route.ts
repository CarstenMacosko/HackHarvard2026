import { after } from "next/server";
import { NextResponse } from "next/server";
import { DroidRequestInput } from "@/lib/droid";
import { runModuleGeneration, startModuleGeneration } from "@/lib/generate-module";
import { backend } from "@/lib/backend";
import { liveIntegrationStatus } from "@/lib/live-keys";
import { RESEARCHER_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** List Droid+Daytona generation jobs from the database. */
export async function GET() {
  const jobs = await backend().droidJobs(30);
  const live = liveIntegrationStatus();
  return NextResponse.json({
    jobs,
    daytona: live.daytona,
    droid: live.droid,
    mode: live.mode,
    droid_exec: live.droid_exec,
  });
}

/**
 * Start in-process module generation (Factory Droid + Daytona).
 * Results are written to droid_jobs.progress and cv_models — no GitHub Actions.
 */
export async function POST(req: Request) {
  const parsed = DroidRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  if (parsed.data.media_type !== "video" || parsed.data.measurement.name !== "index_straight_fraction") {
    return NextResponse.json({ error: "The current track evaluator supports index_straight_fraction video candidates only." }, { status: 422 });
  }
  const input = {
    condition: parsed.data.condition,
    description: parsed.data.description || `${parsed.data.measurement.label} for ${parsed.data.condition}`,
    measurements: [parsed.data.measurement],
    media_type: parsed.data.media_type,
    study_id: parsed.data.study_id ?? null,
  };
  const job = await startModuleGeneration(input);
  const live = liveIntegrationStatus();
  await backend().insertAudit({
    actor: RESEARCHER_NAME,
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
