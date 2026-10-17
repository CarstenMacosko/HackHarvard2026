import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { DroidRequestInput, dispatch, ghCommand, githubConfig, newRequestId, recentRuns, type DroidRequest } from "@/lib/droid";
import { RESEARCHER_NAME } from "@/lib/session";

/** Recent Droid model requests (from the audit log) and, when GitHub is configured, their workflow runs and pull requests. */
export async function GET() {
  const requests = (await backend().audit({ limit: 200 })).filter((a) => a.action === "droid.requested").slice(0, 20);
  if (!githubConfig()) return NextResponse.json({ configured: false, requests, runs: [] });
  try {
    return NextResponse.json({ configured: true, requests, runs: await recentRuns() });
  } catch (e) {
    return NextResponse.json({ configured: true, requests, runs: [], error: e instanceof Error ? e.message : String(e) });
  }
}

/** Ask Droid to build a model for one measurement of a drafted workflow. */
export async function POST(req: Request) {
  const parsed = DroidRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const request: DroidRequest = { ...parsed.data, request_id: newRequestId(parsed.data.measurement.name), requested_by: RESEARCHER_NAME };
  const db = backend();
  const configured = githubConfig() !== null;
  let ref: string | null = null;
  if (configured) {
    try {
      ({ ref } = await dispatch(request));
    } catch (e) {
      return NextResponse.json({ error: `Could not start the Droid workflow: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  }
  await db.insertAudit({
    actor: RESEARCHER_NAME,
    action: "droid.requested",
    entity: "cv_model",
    entity_id: request.request_id,
    detail: { condition: request.condition, measurement: request.measurement.label, media_type: request.media_type, dispatched: configured, ref },
  });
  return NextResponse.json({ request_id: request.request_id, dispatched: configured, ref, request, command: ghCommand(request) }, { status: configured ? 202 : 200 });
}
