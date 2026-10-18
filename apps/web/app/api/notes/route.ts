import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";

const Body = z.object({
  observation_id: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
});

export async function GET(req: Request) {
  const observationId = new URL(req.url).searchParams.get("observation_id");
  if (!observationId) return NextResponse.json({ error: "observation_id required" }, { status: 400 });
  const notes = await backend().observationNotes(observationId);
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const researcher = await currentResearcher();
  if (!researcher) return NextResponse.json({ error: "Sign in as a researcher to add notes." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const note = {
    id: `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    observation_id: parsed.data.observation_id,
    author: await researcherName(),
    body: parsed.data.body,
    created_at: new Date().toISOString(),
  };
  await backend().insertObservationNote(note);
  await backend().insertAudit({
    actor: note.author,
    action: "observation.note",
    entity: "observation",
    entity_id: note.observation_id,
    detail: { note_id: note.id },
  });
  return NextResponse.json({ note });
}
