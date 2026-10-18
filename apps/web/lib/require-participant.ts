import "server-only";
import { redirect } from "next/navigation";
import { backend } from "./backend";
import { currentParticipantId, hasParticipantCookie } from "./session";
import type { Participant } from "./types";

/** Participant portal pages that need a real enrolled session (not the silent demo default). */
export async function requireParticipant(): Promise<Participant> {
  if (!(await hasParticipantCookie())) redirect("/auth/sign-in");
  const [p] = await backend().participants({ id: await currentParticipantId() });
  if (!p) redirect("/participant/session-reset?missing=1");
  return p;
}
