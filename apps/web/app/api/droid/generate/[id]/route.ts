import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { approveGeneratedModule } from "@/lib/generate-module";
import { liveIntegrationStatus } from "@/lib/live-keys";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = (await backend().droidJobs(50)).find((j) => j.id === id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const live = liveIntegrationStatus();
  return NextResponse.json({
    job,
    daytona: live.daytona,
    droid: live.droid,
    mode: live.mode,
  });
}

/** Approve a ready generated module → write sandboxed source + activate in registry. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve") {
    return NextResponse.json({ error: 'Use {"action":"approve"}' }, { status: 400 });
  }
  try {
    const result = await approveGeneratedModule(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
