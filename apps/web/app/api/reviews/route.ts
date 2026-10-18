import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";
import { researcherOwnsStudy } from "@/lib/study-access";

const Body = z.object({
  id: z.string(),
  decision: z.enum(["accepted", "corrected", "rejected"]),
  note: z.string().nullable(),
  corrected: z.array(z.object({ name: z.string(), value: z.number() })).default([]),
});

export async function POST(req: Request) {
  const researcher = await currentResearcher();
  if (!researcher) return NextResponse.json({ error: "Sign in as a researcher to review." }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { id, decision, note, corrected } = parsed.data;
  if (decision !== "accepted" && !note?.trim()) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const db = backend();
  const [obs] = await db.observations({ id });
  if (!obs || !(await researcherOwnsStudy(obs.study_id))) {
    return NextResponse.json({ error: "Observation not found" }, { status: 404 });
  }

  const actor = await researcherName();
  const measurements =
    decision === "corrected"
      ? obs.measurements.map((m) => {
          const c = corrected.find((x) => x.name === m.name);
          return c ? { ...m, value: c.value, uncertainty: null } : m;
        })
      : obs.measurements;

  // the observation holds the latest decision; `reviews` keeps every decision, with the values it replaced
  await db.updateObservation(id, {
    review_status: decision,
    measurements,
    reviewer: actor,
    reviewed_at: new Date().toISOString(),
    review_note: note,
  });
  await db.insertReview({
    observation_id: id,
    reviewer: actor,
    decision,
    corrected_measurements: decision === "corrected" ? corrected : null,
    before_measurements: decision === "corrected" ? obs.measurements : null,
    note,
  });
  await db.insertAudit({
    actor,
    action: `review.${decision}`,
    entity: "observation",
    entity_id: id,
    detail: { participant_id: obs.participant_id, note, corrected },
  });
  return NextResponse.json({ ok: true });
}
