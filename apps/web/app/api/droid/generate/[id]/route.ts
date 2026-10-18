import { NextResponse } from "next/server";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { reviewGeneratedCandidate } from "@/lib/generate-module";
import { liveIntegrationStatus } from "@/lib/live-keys";
import { researcherName } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Search a wide window — generate jobs must remain pollable even after many candidates.
  const job = (await backend().droidJobs(500)).find((j) => j.id === id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const live = liveIntegrationStatus();
  return NextResponse.json({
    job,
    daytona: live.daytona,
    droid: live.droid,
    mode: live.mode,
  });
}

/** Approve a generated candidate: write gen_*.py and make it selectable for studies. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "review" && body.action !== "approve") {
    return NextResponse.json({ error: 'Use {"action":"approve"}' }, { status: 400 });
  }
  try {
    const result = await reviewGeneratedCandidate(id, await researcherName());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
