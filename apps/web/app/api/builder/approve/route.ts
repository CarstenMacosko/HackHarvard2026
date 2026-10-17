import { DEFAULT_REWARDS, type Protocol } from "@vf/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { backend } from "@/lib/backend";
import { RESEARCHER_NAME } from "@/lib/session";

const Body = z.object({ draft_id: z.string() });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "study";

/**
 * Approve a builder draft: it becomes a study (status 'draft', so nobody is invited until the
 * team opens it) with protocol v1. Measurements that need validation or a new model stay
 * flagged in the protocol and inactive until a validated model is registered.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "draft_id is required" }, { status: 400 });
  const db = backend();
  const [d] = await db.drafts({ id: parsed.data.draft_id });
  if (!d) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (d.status === "approved" && d.study_id) return NextResponse.json({ study_id: d.study_id, already: true });

  const studyId = `study_${slug(d.condition)}_${Date.now().toString(36).slice(-4)}`;
  const protocol: Protocol = { study_id: studyId, version: 1, approved_by: RESEARCHER_NAME, tasks: d.draft.tasks, rewards: DEFAULT_REWARDS };
  await db.insertStudy({ id: studyId, name: `${d.condition}: draft protocol`, condition: d.condition, status: "draft", protocol });
  const at = new Date().toISOString();
  await db.updateDraft(d.id, { status: "approved", study_id: studyId, approved_by: RESEARCHER_NAME, approved_at: at });
  await db.insertAudit({ actor: RESEARCHER_NAME, action: "protocol.approved", entity: "study", entity_id: studyId, detail: { draft_id: d.id, condition: d.condition, tasks: d.draft.tasks.length } });
  return NextResponse.json({ study_id: studyId });
}
