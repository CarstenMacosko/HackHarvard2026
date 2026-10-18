import { DEFAULT_CONSENT, DEFAULT_REWARDS, PERIOD_DAYS, captureReminderFor, type Protocol } from "@vf/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";

const Body = z.object({ draft_id: z.string() });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "study";

/**
 * Approve a builder draft: it becomes a study (status 'draft', so nobody is invited until the
 * team opens it) with protocol v1. Measurements that need validation or a new model stay
 * flagged in the protocol and inactive until a validated model is registered.
 */
export async function POST(req: Request) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "draft_id is required" }, { status: 400 });
  const db = backend();
  const [d] = await db.drafts({ id: parsed.data.draft_id });
  if (!d) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (d.status === "approved" && d.study_id) return NextResponse.json({ study_id: d.study_id, already: true });

  const owner = await currentResearcher();
  if (!owner) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const actor = await researcherName();
  const studyId = `study_${slug(d.condition)}_${Date.now().toString(36).slice(-4)}`;
  // same defaults as the New study form: the standard consent text and an upload reminder per task
  const protocol: Protocol = {
    study_id: studyId,
    version: 1,
    approved_by: actor,
    tasks: d.draft.tasks,
    rewards: DEFAULT_REWARDS,
    consent: { ...DEFAULT_CONSENT, title: `${d.condition} remote check-ins` },
    reminders: d.draft.tasks.map((t) => captureReminderFor(t, PERIOD_DAYS[t.cadence] * 24)),
  };
  await db.insertStudy({
    id: studyId,
    name: `${d.condition}: draft protocol`,
    condition: d.condition,
    status: "draft",
    protocol,
    owner_portal_user_id: owner.id,
  });
  const at = new Date().toISOString();
  await db.updateDraft(d.id, { status: "approved", study_id: studyId, approved_by: actor, approved_at: at });
  await db.insertAudit({ actor, action: "protocol.approved", entity: "study", entity_id: studyId, detail: { draft_id: d.id, condition: d.condition, tasks: d.draft.tasks.length } });
  return NextResponse.json({ study_id: studyId });
}
