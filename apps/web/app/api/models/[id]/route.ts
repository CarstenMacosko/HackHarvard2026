import { NextResponse } from "next/server";
import { ValidationStatus } from "@vf/shared";
import { z } from "zod";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";

const Patch = z.object({ active: z.boolean().optional(), status: ValidationStatus.optional() }).refine((p) => Object.keys(p).length > 0);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentResearcher())) return NextResponse.json({ error: "Sign in as a researcher." }, { status: 401 });
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const db = backend();
  const [model] = await db.models({ id });
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });
  if (model.provenance?.source === "droid" && model.metrics.folds === 0 && parsed.data.active) {
    return NextResponse.json({ error: "Legacy Droid placeholder has no trained/evaluated head and cannot be activated." }, { status: 400 });
  }
  if (parsed.data.status === "validated" && model.metrics.n < 30) {
    return NextResponse.json({ error: "Validation needs at least 30 labelled examples; retrain with more data first." }, { status: 400 });
  }
  await db.updateModel(id, parsed.data);
  await db.insertAudit({ actor: await researcherName(), action: "model.updated", entity: "cv_model", entity_id: id, detail: parsed.data });
  return NextResponse.json({ ...model, ...parsed.data });
}
