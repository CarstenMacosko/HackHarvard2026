"use server";

import { cookies } from "next/headers";
import { ConflictError, backend } from "@/lib/backend";
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

export async function enroll(input: { code: string; phone: string; preferredTime: string; consent: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!input.consent) return { ok: false, error: "Consent is required to join." };
  const phone = input.phone.replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a mobile number we can text." };
  if (!/^\d{2}:\d{2}$/.test(input.preferredTime)) return { ok: false, error: "Choose a reminder time." };
  const db = backend();
  const [p] = await db.participants({ inviteCode: input.code.trim() });
  if (!p || p.status !== "invited") return { ok: false, error: "Invitation not found or already used." };
  const at = new Date().toISOString();
  const patch = { status: "active" as const, phone, preferred_time: input.preferredTime, enrolled_at: at, consented_at: at };
  try {
    await db.updateParticipant(p.id, patch);
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: "That mobile number is already enrolled. Use another number or contact your study coordinator." };
    throw e;
  }
  // their first check-in is due now, so the first usable capture earns points
  await ensureSchedule({ ...p, ...patch });
  await db.insertAudit({ actor: p.id, action: "participant.enrolled", entity: "participant", entity_id: p.id, detail: { consent: true, consented_at: at } });
  (await cookies()).set(PARTICIPANT_COOKIE, p.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  return { ok: true };
}
