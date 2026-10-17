import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, STATUS_TONE, Stat } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { pct, relTime, shortDate } from "@/lib/format";
import { getParticipantDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getParticipantDetail(id);
  if (!detail) notFound();
  const { participant: p, study, observations, tasks } = detail;
  const past = tasks.filter((t) => t.status !== "pending").sort((a, b) => a.due_at.localeCompare(b.due_at));

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={`/researcher/studies/${p.study_id}`} className="text-brand-600 hover:underline">← {study?.name}</Link>
      </div>
      <PageHeader
        title={p.display_name}
        subtitle={<>Enrolled {p.enrolled_at ? shortDate(p.enrolled_at) : "—"} · check-ins at {p.preferred_time ?? "—"} · {p.phone ?? "no phone linked"}</>}
        action={<Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card><Stat label="Completion" value={pct(p.completion_rate)} /></Card>
        <Card><Stat label="Streak" value={p.streak} /></Card>
        <Card><Stat label="Observations" value={observations.length} /></Card>
        <Card><Stat label="To review" value={p.pending_reviews} /></Card>
        <Card><Stat label="Last check-in" value={relTime(p.last_submission_at)} /></Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">Longitudinal timeline</h2>
        <Timeline observations={observations} />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Adherence</h2>
        <div className="flex flex-wrap gap-1.5">
          {past.map((t) => (
            <div
              key={t.id}
              title={`${shortDate(t.due_at)}: ${t.status}`}
              className={`h-6 w-6 rounded ${t.status === "completed" ? "bg-emerald-500" : "bg-rose-300"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Each square is a scheduled check-in: green completed, red missed.</p>
      </Card>
    </>
  );
}
