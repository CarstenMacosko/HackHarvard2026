import "server-only";
import { cookies } from "next/headers";
import { currentResearcher, researcherDisplayName } from "./auth";

export const PARTICIPANT_COOKIE = "vf_participant";

/** Researcher display name for reviews / audit (signed-in researcher, else demo label). */
export async function researcherName(): Promise<string> {
  return researcherDisplayName(await currentResearcher());
}

/** @deprecated prefer researcherName() — kept for call sites that need a sync string in client bundles */
export const RESEARCHER_NAME = "Demo clinician";

/** Participant id from the session cookie, or empty when unsigned (no silent demo default). */
export async function currentParticipantId(): Promise<string> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value ?? "";
}

/** True when the browser remembers a participant (as opposed to the default test account). */
export async function hasParticipantCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(PARTICIPANT_COOKIE)?.value);
}
