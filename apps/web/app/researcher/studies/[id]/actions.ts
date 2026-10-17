"use server";

import { revalidatePath } from "next/cache";
import { backend } from "@/lib/backend";

export async function createInvite(studyId: string): Promise<string> {
  const db = backend();
  const existing = await db.participants({ studyId });
  const prefix = studyId === "study_pd" ? "PD" : studyId === "study_ad" ? "AD" : "ST";
  const n = existing.length + 1;
  const code = `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.insertParticipant({
    id: `p_${studyId.slice(-2)}_${Date.now().toString(36)}`,
    study_id: studyId,
    display_name: `Participant ${String(n).padStart(3, "0")}`,
    phone: null,
    invite_code: code,
    status: "invited",
    enrolled_at: null,
    preferred_time: null,
  });
  revalidatePath(`/researcher/studies/${studyId}`);
  return code;
}
