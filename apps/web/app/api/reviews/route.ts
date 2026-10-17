import { NextResponse } from "next/server";
import { z } from "zod";
import { backend } from "@/lib/backend";
import { RESEARCHER_NAME } from "@/lib/session";

const Body = z.object({
  id: z.string(),
  decision: z.enum(["accepted", "corrected", "rejected"]),
  note: z.string().nullable(),
  corrected: z.array(z.object({ name: z.string(), value: z.number() })).default([]),
});

// TODO(A): take the reviewer from the Supabase session and also insert into `reviews`.

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { id, decision, note, corrected } = parsed.data;
  if (decision !== "accepted" && !note?.trim()) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const db = backend();
  const [obs] = await db.observations({ id });
  if (!obs) return NextResponse.json({ error: "Observation not found" }, { status: 404 });

  const measurements =
    decision === "corrected"
      ? obs.measurements.map((m) => {
          const c = corrected.find((x) => x.name === m.name);
          return c ? { ...m, value: c.value, uncertainty: null } : m;
        })
      : obs.measurements;

  await db.updateObservation(id, {
    review_status: decision,
    measurements,
    reviewer: RESEARCHER_NAME,
    reviewed_at: new Date().toISOString(),
    review_note: note,
  });
  await db.insertAudit({
    actor: RESEARCHER_NAME,
    action: `review.${decision}`,
    entity: "observation",
    entity_id: id,
    detail: { participant_id: obs.participant_id, note, corrected },
  });
  return NextResponse.json({ ok: true });
}
