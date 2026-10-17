import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { reviewGeneratedCandidate } from "@/lib/generate-module";
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

/** Mark a generated source candidate reviewed; no model is registered or deployed. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "review") {
    return NextResponse.json({ error: 'Use {"action":"review"}' }, { status: 400 });
  }
  try {
    const result = await reviewGeneratedCandidate(id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
