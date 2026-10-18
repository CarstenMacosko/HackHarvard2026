"use server";

import { revalidatePath } from "next/cache";
import { ConflictError, backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";
import { requireOwnedStudy } from "@/lib/study-access";

export async function createInvite(studyId: string): Promise<string> {
  const study = await requireOwnedStudy(studyId);
  const db = backend();
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

/** Wipe a study and all tied rows. Created modules (droid jobs) are left alone. */
export async function deleteStudyAction(studyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = studyId.trim();
  if (!id) return { ok: false, error: "Missing study id." };
  let study;
  try {
    study = await requireOwnedStudy(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHORIZED_RESEARCHER") return { ok: false, error: "Sign in as a researcher to delete a study." };
    return { ok: false, error: "Study not found." };
  }
  try {
    const by = await researcherName();
    await backend().deleteStudy(id);
    await backend().insertAudit({
      actor: by,
      action: "study.deleted",
      entity: "study",
      entity_id: id,
      detail: { name: study.name },
    });
    revalidatePath("/researcher/studies");
    revalidatePath(`/researcher/studies/${id}`);
    revalidatePath("/researcher/participants");
    revalidatePath("/researcher/review");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
