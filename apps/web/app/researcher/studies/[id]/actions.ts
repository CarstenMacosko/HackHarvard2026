"use server";

import { revalidatePath } from "next/cache";
import { backend } from "@/lib/backend";
import { RESEARCHER_NAME } from "@/lib/session";

export async function createInvite(studyId: string): Promise<string> {
  const db = backend();
  const study = (await db.studies()).find((s) => s.id === studyId);
  if (!study) throw new Error("unknown study");
  const existing = await db.participants({ studyId });
  const prefix = study.condition === "parkinsons" ? "PD" : study.condition === "eczema" ? "AD" : "ST";
  const code = `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const id = `p_${studyId.slice(-2)}_${Date.now().toString(36)}`;
  await db.insertParticipant({
    id,
    study_id: studyId,
    display_name: `Participant ${String(existing.length + 1).padStart(3, "0")}`,
    phone: null,
    invite_code: code,
    status: "invited",
    enrolled_at: null,
    preferred_time: null,
  });
  await db.insertAudit({ actor: RESEARCHER_NAME, action: "participant.invited", entity: "participant", entity_id: id, detail: { study_id: studyId } });
  revalidatePath(`/researcher/studies/${studyId}`);
  return code;
}
