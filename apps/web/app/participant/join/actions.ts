"use server";

import { cookies } from "next/headers";
import { RESEARCHER_COOKIE } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { sessionCookieOptions } from "@/lib/deploy";
import { ensureSchedule } from "@/lib/schedule";
import { PARTICIPANT_COOKIE } from "@/lib/session";

export type LookupResult = { ok: true; studyName: string; taskLabel: string; instructions: string; mediaType: string } | { ok: false; error: string };

export async function lookupInvite(code: string): Promise<LookupResult> {
  const db = backend();
  const [p] = await db.participants({ inviteCode: code.trim() });
  if (!p) return { ok: false, error: "That code doesn't match an invitation. Check with your study coordinator." };
  if (p.status !== "invited") return { ok: false, error: "This invitation has already been used." };
  const study = (await db.studies()).find((s) => s.id === p.study_id);
  const task = study?.protocol.tasks[0];
  return { ok: true, studyName: study?.name ?? p.study_id, taskLabel: task?.label ?? "", instructions: task?.instructions ?? "", mediaType: task?.media_type ?? "photo" };
}

export async function enroll(input: { code: string; displayName: string; consent: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!input.consent) return { ok: false, error: "Consent is required to join." };
  const name = input.displayName.trim();
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  const db = backend();
  const [p] = await db.participants({ inviteCode: input.code.trim() });
  if (!p || p.status !== "invited") return { ok: false, error: "Invitation not found or already used." };
  const at = new Date().toISOString();
  const patch = { status: "active" as const, display_name: name, phone: null, preferred_time: null, enrolled_at: at, consented_at: at };
  try {
    await db.updateParticipant(p.id, patch);
    await ensureSchedule({ ...p, ...patch });
    await db.insertAudit({ actor: p.id, action: "participant.enrolled", entity: "participant", entity_id: p.id, detail: { consent: true, consented_at: at } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[join] enroll failed:", msg);
    return { ok: false, error: `Could not enroll: ${msg}` };
  }
  const jar = await cookies();
  const opts = sessionCookieOptions();
  jar.set(RESEARCHER_COOKIE, "", { ...opts, maxAge: 0 });
  jar.set(PARTICIPANT_COOKIE, p.id, opts);
  return { ok: true };
}
