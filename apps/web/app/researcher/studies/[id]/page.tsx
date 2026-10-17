import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, PageHeader, STATUS_TONE, ValidationBadge } from "@/components/ui";
import { CONDITION_LABEL, pct, relTime } from "@/lib/format";
import { getStudy, listParticipants } from "@/lib/queries";
import { InviteButton } from "./invite-button";

export const dynamic = "force-dynamic";

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const study = await getStudy(id);
  if (!study) notFound();
  const participants = await listParticipants(id);

  return (
    <>
      <PageHeader
        title={study.name}
        subtitle={`${CONDITION_LABEL[study.condition]} · protocol v${study.protocol.version} approved by ${study.protocol.approved_by ?? "—"}`}
        action={<ButtonLink href={`/researcher/review?study=${id}`} variant="secondary">Review queue</ButtonLink>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-x-auto p-0">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-semibold">Participants</h2>
            <InviteButton studyId={id} />
          </div>
          <table className="mt-3 w-full min-w-[640px] text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Participant</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Completion</th>
                <th className="px-3 py-2 font-medium">Streak</th>
                <th className="px-3 py-2 font-medium">Last check-in</th>
                <th className="px-3 py-2 font-medium">To review</th>
                <th className="px-3 py-2 font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <Link href={`/researcher/participants/${p.id}`} className="font-medium text-brand-600 hover:underline">
                      {p.display_name}
                    </Link>
                    {p.status === "invited" && <div className="text-xs text-slate-400">invite code {p.invite_code}</div>}
                  </td>
                  <td className="px-3 py-2.5"><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                  <td className={`px-3 py-2.5 tabular-nums ${p.completion_rate < 0.7 && p.status === "active" ? "font-medium text-rose-600" : ""}`}>
                    {p.status === "invited" ? "—" : pct(p.completion_rate)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{p.streak || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{relTime(p.last_submission_at)}</td>
                  <td className="px-3 py-2.5">{p.pending_reviews ? <Badge tone="amber">{p.pending_reviews}</Badge> : "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-6">
          {study.protocol.tasks.map((t) => (
            <Card key={t.id}>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Protocol task · {t.cadence.replace("_", " ")}</div>
              <div className="mt-1 font-semibold">{t.label}</div>
              <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">“{t.instructions}”</p>
              <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Measurements</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {t.measurements.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-2">
                    <span>{m.label} <span className="text-slate-400">({m.unit})</span></span>
                    <ValidationBadge status={m.validation_status} />
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Quality gate</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(t.quality_criteria).map(([k, v]) => (
                  <Badge key={k}>{k} {v}</Badge>
                ))}
              </div>
            </Card>
          ))}
          <Card>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rewards</div>
            <p className="mt-1 text-sm text-slate-600">
              {study.protocol.rewards.base_points} pts per usable submission, +{study.protocol.rewards.on_time_bonus} on time, streak up to ×
              {study.protocol.rewards.max_multiplier}. Simulated payouts only.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
