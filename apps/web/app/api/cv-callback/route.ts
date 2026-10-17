import { NextResponse } from "next/server";
import { lifetimePoints, Observation, tierFor } from "@vf/shared";
import { z } from "zod";
import { backend } from "@/lib/backend";
import { ingest } from "@/lib/ingest";

const Body = z.union([
  z.object({ observation: Observation, attempt: z.number().int().min(1).optional(), task_id: z.string().optional() }),
  Observation.transform((observation) => ({ observation, attempt: undefined, task_id: undefined })),
]);

/**
 * The messaging agent posts every analysed attempt here (CV ran in services/cv). This route
 * owns the database writes and the reward ledger, and returns the confirmation text to send.
 */
export async function POST(req: Request) {
  const secret = process.env.CV_CALLBACK_SECRET;
  if (secret && req.headers.get("x-callback-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { observation: o, attempt, task_id } = parsed.data;

  const db = backend();
  const [participant] = await db.participants({ id: o.participant_id });
  if (!participant) return NextResponse.json({ error: "unknown participant" }, { status: 404 });
  const study = (await db.studies()).find((s) => s.id === participant.study_id);
  const task = study?.protocol.tasks.find((t) => (task_id ? t.id === task_id : t.module === o.module));
  if (!study || !task) return NextResponse.json({ error: "no matching protocol task" }, { status: 404 });

  try {
    const result = await ingest({
      participant,
      study,
      task,
      analysis: { quality: o.quality, measurements: o.measurements, features: o.features, model_version: o.model_version },
      runtime: "server",
      source: "sms",
      mediaUrl: o.media_url,
      patientReport: o.patient_report,
      context: o.context,
      attempt,
      observationId: o.id,
    });
    const tier = tierFor(study.protocol.rewards, lifetimePoints(await db.rewardEvents(participant.id)));
    return NextResponse.json({
      accepted: result.submission.accepted,
      submission_id: result.submission.id,
      observation_id: result.observation?.id ?? null,
      reward_events: result.reward_events,
      streak: result.streak,
      points_balance: result.points_balance,
      tier: tier.current.name,
      next_tier: tier.next ? { name: tier.next.name, points: tier.next.points } : null,
      lifetime_points: lifetimePoints(await db.rewardEvents(participant.id)),
      message: result.submission.accepted ? result.message.replace(/^Usable capture ✅ /, "") : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ingest failed" }, { status: 400 });
  }
}
