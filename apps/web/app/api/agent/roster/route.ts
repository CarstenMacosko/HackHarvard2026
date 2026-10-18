import { NextResponse } from "next/server";
import { agentSecretOk } from "@/lib/agent-notify";
import { backend } from "@/lib/backend";

/** The messaging agent pulls enrolled participants, protocols, and reminder intervals. */
export async function GET(req: Request) {
  if (!agentSecretOk(req.headers.get("x-agent-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = process.env.WEB_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const db = backend();
  const [studies, participants] = await Promise.all([db.studies(), db.participants()]);
  const roster = participants
    .filter((p) => p.phone && (p.status === "active" || p.status === "invited"))
    .map((p) => {
      const study = studies.find((s) => s.id === p.study_id);
      const code = encodeURIComponent(p.invite_code);
      return {
        id: p.id,
        studyId: p.study_id,
        studyName: study?.name ?? p.study_id,
        address: p.phone,
        name: p.display_name,
        status: p.status,
        inviteCode: p.invite_code,
        joinUrl: `${origin}/participant/join?code=${code}`,
        preferredTime: p.preferred_time,
        tasks: study?.protocol.tasks ?? [],
        reminders: study?.protocol.reminders ?? [],
      };
    });
  return NextResponse.json({
    photonNumber: process.env.PHOTON_PHONE_NUMBER ?? "",
    participants: roster,
  });
}
