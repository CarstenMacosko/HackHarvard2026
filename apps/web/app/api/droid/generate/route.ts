import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { runModuleGeneration, startModuleGeneration } from "@/lib/generate-module";
import { backend } from "@/lib/backend";
import { liveIntegrationStatus } from "@/lib/live-keys";
import { researcherName } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  condition: z.string().min(2).max(80),
  name: z.string().min(2).max(80),
  description: z.string().min(8).max(2000),
  measurements: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/),
        label: z.string().min(1).max(80),
        unit: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(8),
  media_type: z.enum(["photo", "video"]).default("video"),
  study_id: z.string().max(60).nullable().optional(),
  /** Must be true after the design-loop assessor marks the plan feasible and the researcher accepts it. */
  plan_accepted: z.literal(true),
});

/** Start a Droid + Daytona module generation job (progress via GET /api/droid/generate/[id]). */
export async function POST(req: Request) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  if (parsed.data.media_type !== "video") {
    return NextResponse.json({ error: "Video modules only for this generator." }, { status: 422 });
  }
  const live = liveIntegrationStatus();
  const actor = await researcherName();
  const job = await startModuleGeneration(parsed.data, actor);
  await backend().insertAudit({
    actor,
    action: "droid.module_requested",
    entity: "droid_job",
    entity_id: job.id,
    detail: {
      condition: parsed.data.condition,
      measurement: parsed.data.measurements[0]?.label,
      daytona: live.daytona,
      droid: live.droid,
      mode: live.mode,
    },
  });

  after(() => runModuleGeneration(job.id, parsed.data));

  return NextResponse.json(
    {
      job_id: job.id,
      status: job.status,
      daytona: live.daytona,
      droid: live.droid,
      mode: live.mode,
    },
    { status: 202 },
  );
}

/** List recent module-generation jobs. */
export async function GET() {
  const live = liveIntegrationStatus();
  const jobs = (await backend().droidJobs(30)).filter((j) => j.kind === "module_generate" || (j.request as { kind?: string })?.kind === "module_generate");
  return NextResponse.json({
    jobs,
    daytona: live.daytona,
    droid: live.droid,
    mode: live.mode,
  });
}
