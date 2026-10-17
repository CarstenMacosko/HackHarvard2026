import "server-only";
import { cookies } from "next/headers";

export const PARTICIPANT_COOKIE = "vf_participant";
/** Demo default so the participant portal renders before anyone joins. TODO: Supabase Auth. */
const DEMO_PARTICIPANT = "p_001";
/** Demo researcher identity for reviews, model registration and the audit log. TODO: Supabase Auth. */
export const RESEARCHER_NAME = "Demo clinician";

export async function currentParticipantId(): Promise<string> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value ?? DEMO_PARTICIPANT;
}

/** True when the browser remembers a participant (as opposed to the default test account). */
export async function hasParticipantCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(PARTICIPANT_COOKIE)?.value);
}
