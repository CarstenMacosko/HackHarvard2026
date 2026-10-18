import { NextResponse } from "next/server";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { draftWorkflow } from "@/lib/builder";
import { researcherName } from "@/lib/session";

const Body = z.object({ prompt: z.string().min(10).max(4000) });

/** Draft a workflow for a new condition and keep it (workflow_drafts) until a clinician approves it. */
export async function POST(req: Request) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Describe the condition in at least a sentence." }, { status: 400 });
  const draft = await draftWorkflow(parsed.data.prompt);
  const id = `wd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await backend().insertDraft({
    id,
    condition: draft.condition,
    draft,
    source: draft.source,
    status: "draft",
    study_id: null,
    created_by: await researcherName(),
    approved_by: null,
    approved_at: null,
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ...draft, draft_id: id });
}
