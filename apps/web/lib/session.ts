import "server-only";
import { cookies } from "next/headers";

export const PARTICIPANT_COOKIE = "vf_participant";
/** Demo default so the participant portal renders before anyone joins. TODO: Supabase Auth. */
const DEMO_PARTICIPANT = "p_001";

export async function currentParticipantId(): Promise<string> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value ?? DEMO_PARTICIPANT;
}
