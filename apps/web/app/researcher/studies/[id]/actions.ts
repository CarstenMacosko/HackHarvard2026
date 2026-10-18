"use server";

import { revalidatePath } from "next/cache";
import { currentResearcher } from "@/lib/auth";
import { ConflictError, backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";

export async function createInvite(studyId: string): Promise<string> {
  if (!(await currentResearcher())) throw new Error("UNAUTHORIZED_RESEARCHER");
  const db = backend();
  const study = (await db.studies()).find((s) => s.id === studyId);
  if (!study) throw new Error("unknown study");
  const existing = await db.participants({ studyId });
  const prefix = study.condition === "parkinsons" ? "PD" : study.condition === "eczema" ? "AD" : "ST";
  const id = `p_${studyId.slice(-2)}_${Date.now().toString(36)}`;
  let code = "";
  // four random characters: retry the rare collision with an existing code
  for (let attempt = 0; ; attempt++) {
    code = `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
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
      break;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 4) throw e;
    }
  }
  await db.insertAudit({
    actor: await researcherName(),
    action: "participant.invited",
    entity: "participant",
    entity_id: id,
    detail: { study_id: studyId },
  });
  revalidatePath(`/researcher/studies/${studyId}`);
  return code;
}
