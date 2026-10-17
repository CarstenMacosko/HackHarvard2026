import { NextResponse } from "next/server";
import { z } from "zod";
import { agentSecretOk } from "@/lib/agent-notify";
import { backend } from "@/lib/backend";

const Body = z.object({
  participant_id: z.string(),
  action: z.string(),
  detail: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  if (!agentSecretOk(req.headers.get("x-agent-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const db = backend();
  const [p] = await db.participants({ id: parsed.data.participant_id });
  if (!p) return NextResponse.json({ error: "unknown participant" }, { status: 404 });
  await db.insertAudit({
    actor: p.id,
    action: parsed.data.action,
    entity: "participant",
    entity_id: p.id,
    detail: parsed.data.detail ?? null,
  });
  return NextResponse.json({ ok: true });
}
