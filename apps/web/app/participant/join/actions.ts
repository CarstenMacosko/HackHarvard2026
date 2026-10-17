"use server";

import { cookies } from "next/headers";
import { backend } from "@/lib/backend";
import { PARTICIPANT_COOKIE } from "@/lib/session";

export type LookupResult = { ok: true; studyName: string; taskLabel: string; instructions: string } | { ok: false; error: string };

export async function lookupInvite(code: string): Promise<LookupResult> {
  const db = backend();
  const [p] = await db.participants({ inviteCode: code.trim() });
  if (!p) return { ok: false, error: "That code doesn't match an invitation. Check with your study coordinator." };
  if (p.status !== "invited") return { ok: false, error: "This invitation has already been used." };
  const study = (await db.studies()).find((s) => s.id === p.study_id);
  const task = study?.protocol.tasks[0];
  return { ok: true, studyName: study?.name ?? p.study_id, taskLabel: task?.label ?? "", instructions: task?.instructions ?? "" };
}

export async function enroll(input: { code: string; phone: string; preferredTime: string; consent: boolean }): Promise<{ ok: boolean; error?: string }> {
  if (!input.consent) return { ok: false, error: "Consent is required to join." };
  const phone = input.phone.replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Enter a mobile number we can text." };
  const db = backend();
  const [p] = await db.participants({ inviteCode: input.code.trim() });
  if (!p || p.status !== "invited") return { ok: false, error: "Invitation not found or already used." };
  // TODO(B): create a Supabase Auth user (phone OTP) and set participants.user_id + consented_at.
  await db.updateParticipant(p.id, { status: "active", phone, preferred_time: input.preferredTime, enrolled_at: new Date().toISOString() });
  (await cookies()).set(PARTICIPANT_COOKIE, p.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  return { ok: true };
}

/** Demo helper: view the portal as an existing synthetic participant. */
export async function viewAs(id: string) {
  (await cookies()).set(PARTICIPANT_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax" });
}
