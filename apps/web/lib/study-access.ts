import "server-only";
import { currentResearcher, requireResearcher } from "./auth";
import { backend } from "./backend";
import type { Study } from "./types";

/** Study ids owned by the signed-in researcher (empty when unsigned). */
export async function ownedStudyIds(): Promise<Set<string>> {
  const user = await currentResearcher();
  if (!user) return new Set();
  const studies = await backend().studies();
  return new Set(studies.filter((s) => s.owner_portal_user_id === user.id).map((s) => s.id));
}

export function isOwnedBy(study: Study | undefined | null, portalUserId: string): boolean {
  return Boolean(study?.owner_portal_user_id && study.owner_portal_user_id === portalUserId);
}

/** Load a study only if the current researcher created it. */
export async function requireOwnedStudy(studyId: string): Promise<Study> {
  const user = await requireResearcher();
  const study = (await backend().studies()).find((s) => s.id === studyId);
  if (!study || !isOwnedBy(study, user.id)) {
    throw new Error("STUDY_NOT_FOUND");
  }
  return study;
}

export async function researcherOwnsStudy(studyId: string): Promise<boolean> {
  const user = await currentResearcher();
  if (!user) return false;
  const study = (await backend().studies()).find((s) => s.id === studyId);
  return isOwnedBy(study, user.id);
}
