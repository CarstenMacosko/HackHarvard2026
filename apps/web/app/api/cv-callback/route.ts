import { NextResponse } from "next/server";
import { Observation } from "@vf/shared";
import { backend } from "@/lib/backend";

/** The messaging agent posts each accepted observation here; this route owns the database write. */
export async function POST(req: Request) {
  const secret = process.env.CV_CALLBACK_SECRET;
  if (secret && req.headers.get("x-callback-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = Observation.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const db = backend();
  const [participant] = await db.participants({ id: parsed.data.participant_id });
  if (!participant) return NextResponse.json({ error: "unknown participant" }, { status: 404 });

  await db.insertObservation({ ...parsed.data, review_status: "pending", reviewer: null, reviewed_at: null });
  return NextResponse.json({ ok: true, id: parsed.data.id });
}
