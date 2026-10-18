import { ArrowRight, CalendarClock, Flame, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CHECK_LABEL, dateTime, relTime, shortDate } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { requireParticipant } from "@/lib/require-participant";

export const metadata = { title: "Home" };

export default async function ParticipantHome() {
  const participant = await requireParticipant();
  const home = await participantHome(participant.id);
  if (!home || !home.study) {
    return (
      <Card>
        <EmptyState title="We couldn't find your enrollment" action={<ButtonLink href="/participant/join">Join with an invite code</ButtonLink>} />
      </Card>
    );
  }
  const { participant: p, study, submissions, observations, availableTasks } = home;
  const reviewOf = new Map(observations.map((o) => [o.id, o.review_status]));
  const due = availableTasks.filter((t) => t.dueNow);

  return (
    <>
      <PageHeader title={`Hi, ${p.display_name}`} description={study.name} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className={due.length ? "border-brand-200 bg-brand-50/50" : undefined}>
            <CardHeader title={due.length ? "Tests due now" : "Your tests"} description="Each test uses its own CV model and instructions." />
            {availableTasks.length === 0 ? (
              <EmptyState title="No tests assigned yet">Your study team will assign check-ins here.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {availableTasks.map(({ task, dueNow, scheduled }) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <CalendarClock className="h-4 w-4 text-brand-600" strokeWidth={1.75} />
                        {task.label}
                        {dueNow && <Badge tone="amber">due</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.instructions}</p>
                      <div className="mt-1 text-xs text-slate-500">
                        {scheduled ? (dueNow ? `Due ${relTime(scheduled.due_at)}` : `Next ${shortDate(scheduled.due_at)}`) : "Available"}
                        {" · "}
                        <span className="font-mono">{task.module}</span>
                      </div>
                    </div>
                    <ButtonLink href={`/participant/check-in?task=${encodeURIComponent(task.id)}`} size="md" variant={dueNow ? "primary" : "secondary"}>
                      {dueNow ? "Start" : "Open"} <ArrowRight className="h-4 w-4" />
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Recent check-ins"
              actions={
                <Link href="/participant/history" className="text-xs font-medium text-brand-700 hover:underline">
                  Full history
                </Link>
              }
            />
            {submissions.length === 0 ? (
              <EmptyState title="No check-ins yet">Complete your first check-in when it opens.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...submissions]
                  .reverse()
                  .slice(0, 6)
                  .map((s) => {
                    const review = s.observation_id ? reviewOf.get(s.observation_id) : undefined;
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                        <div>
                          <div className="text-slate-900">{dateTime(s.created_at)}</div>
                          <div className="text-xs text-slate-500">
                            {s.accepted
                              ? "Usable capture"
                              : `Retake requested: ${s.quality.checks
                                  .filter((c) => !c.passed && !c.advisory)
                                  .map((c) => (CHECK_LABEL[c.name] ?? c.name).toLowerCase())
                                  .join(", ")}`}
                          </div>
                        </div>
                        {s.accepted ? (
                          review === "pending" ? (
                            <Badge tone="amber">with your care team</Badge>
                          ) : review === "rejected" ? (
                            <Badge tone="red">couldn&apos;t be used</Badge>
                          ) : (
                            <Badge tone="green">reviewed</Badge>
                          )
                        ) : (
                          <Badge>retake</Badge>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 divide-x divide-slate-100">
              {[
                { icon: Flame, color: "text-orange-500", value: p.streak, label: "streak" },
                { icon: ShieldCheck, color: "text-emerald-600", value: `${Math.round(p.completion_rate * 100)}%`, label: "completed" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center px-2 py-4 text-center">
                  <s.icon className={`h-4 w-4 ${s.color}`} strokeWidth={1.75} />
                  <div className="tabular mt-1 text-xl font-semibold text-slate-900">{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardBody className="text-sm text-slate-600">
              Every check-in is checked automatically for quality, then reviewed by your study team.
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
