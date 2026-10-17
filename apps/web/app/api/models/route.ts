import { NextResponse } from "next/server";
import { CvModel } from "@vf/shared";
import { backend } from "@/lib/backend";
import { RESEARCHER_NAME } from "@/lib/session";

export async function GET() {
  return NextResponse.json(await backend().models());
}

/** Register a model trained in the browser. It starts as "reusable, needs validation". */
const NewModel = CvModel.omit({ id: true, status: true, active: true, version: true, created_by: true, created_at: true });

export async function POST(req: Request) {
  const parsed = NewModel.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const m = parsed.data;
  if (m.weights.length !== m.features.length || m.feature_means.length !== m.features.length || m.feature_stds.length !== m.features.length) {
    return NextResponse.json({ error: "weights, means and stds must match the feature list" }, { status: 400 });
  }
  if (!/^[a-z][a-z0-9_]{1,48}$/.test(m.target.name)) {
    return NextResponse.json({ error: "target name must be snake_case (letters, digits, underscores)" }, { status: 400 });
  }
  const db = backend();
  const existing = await db.models();
  const version = existing.filter((x) => x.target.name === m.target.name && x.module === m.module && x.study_id === m.study_id).length + 1;
  // a new version replaces the previous one for new observations
  for (const old of existing.filter((x) => x.target.name === m.target.name && x.module === m.module && x.study_id === m.study_id && x.active)) {
    await db.updateModel(old.id, { active: false });
  }
  const model: CvModel = {
    ...m,
    id: `cvm_${Date.now().toString(36)}`,
    status: "reusable_needs_validation",
    active: true,
    version,
    created_by: RESEARCHER_NAME,
    created_at: new Date().toISOString(),
  };
  await db.insertModel(model);
  await db.insertAudit({ actor: RESEARCHER_NAME, action: "model.registered", entity: "cv_model", entity_id: model.id, detail: { name: model.name, version, metrics: model.metrics } });
  return NextResponse.json(model, { status: 201 });
}
