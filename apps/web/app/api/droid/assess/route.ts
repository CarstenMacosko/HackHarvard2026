import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { assessMeasurementPlan } from "@/lib/droid-assess";
import { liveIntegrationStatus } from "@/lib/live-keys";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  condition: z.string().min(2).max(80),
  description: z.string().min(8).max(2000),
  measurements: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/),
        label: z.string().min(1).max(80),
        unit: z.string().min(1).max(40),
      }),
    )
    .min(1)
    .max(8),
  message: z.string().max(2000).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["researcher", "droid"]),
        text: z.string().min(1).max(4000),
        at: z.string(),
      }),
    )
    .max(24)
    .optional(),
});

/** Design-loop: Droid assesses whether the proposed measurements are feasible before Generate. */
export async function POST(req: Request) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const result = await assessMeasurementPlan(parsed.data);
  const live = liveIntegrationStatus();
  return NextResponse.json({ ...result, droid: live.droid, daytona: live.daytona });
}
