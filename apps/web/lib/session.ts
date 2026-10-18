import "server-only";
import { cookies } from "next/headers";
import { currentResearcher, researcherDisplayName } from "./auth";

export const PARTICIPANT_COOKIE = "vf_participant";

/** Researcher display name for reviews / audit — always the signed-in researcher. */
export async function researcherName(): Promise<string> {
  const user = await currentResearcher();
  if (!user) throw new Error("UNAUTHORIZED_RESEARCHER");
  return researcherDisplayName(user);
}

/** Participant id from the session cookie, or empty when unsigned (no silent demo default). */
export async function currentParticipantId(): Promise<string> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value ?? "";
}

/** True when the browser remembers a participant (as opposed to the default test account). */
export async function hasParticipantCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(PARTICIPANT_COOKIE)?.value);
}
