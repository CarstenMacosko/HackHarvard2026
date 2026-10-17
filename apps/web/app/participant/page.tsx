import { ArrowRight, CalendarClock, Flame, Gift, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { CHECK_LABEL, dateTime, relTime, shortDate } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";

export const metadata = { title: "Home" };

export default async function ParticipantHome() {
  const home = await participantHome(await currentParticipantId());
  if (!home || !home.study) {
    return (
      <Card>
        <EmptyState title="We couldn't find your enrollment" action={<ButtonLink href="/participant/join">Join with an invite code</ButtonLink>} />
      </Card>
    );
  }
  const { participant: p, study, submissions, observations, nextTask, dueNow, balance, lifetime, tier } = home;
  const task = study.protocol.tasks[0];
  const reviewOf = new Map(observations.map((o) => [o.id, o.review_status]));
  const toNext = tier?.next ? tier.next.points - lifetime : 0;

  return (
    <>
      <PageHeader title={`Hi, ${p.display_name}`} description={study.name} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className={dueNow ? "border-brand-200 bg-brand-50/50" : undefined}>
            <CardBody className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 text-brand-600" strokeWidth={1.75} />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{dueNow ? "Your check-in is due" : "Next check-in"}</div>
                  <div className="text-sm text-slate-600">
                    {task.label} · about a minute
                    {nextTask && !dueNow && <> · opens {shortDate(nextTask.due_at)}</>}
                    {nextTask && dueNow && <> · due {relTime(nextTask.due_at)}</>}
                  </div>
                </div>
              </div>
              <ButtonLink href="/participant/check-in" size="lg" variant={dueNow ? "primary" : "secondary"}>
                {dueNow ? "Start check-in" : "Send an extra check-in"} <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </CardBody>
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
              <EmptyState title="No check-ins yet">Your first usable check-in earns a welcome badge.</EmptyState>
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
                            {s.accepted ? "Usable capture" : `Retake requested: ${s.quality.checks.filter((c) => !c.passed && !c.advisory).map((c) => (CHECK_LABEL[c.name] ?? c.name).toLowerCase()).join(", ")}`}
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
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {[
                { icon: Flame, color: "text-orange-500", value: p.streak, label: "streak" },
                { icon: Gift, color: "text-brand-600", value: balance, label: "points" },
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
          {tier && (
            <Link href="/participant/rewards" className="block">
              <Card className="transition-colors hover:border-brand-300">
                <CardBody>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{tier.current.name} tier</span>
                    <span className="text-slate-500">{tier.next ? `${toNext} pts to ${tier.next.name}` : "Top tier"}</span>
                  </div>
                  <ProgressBar className="mt-2" value={tier.next ? (lifetime - tier.current.points) / (tier.next.points - tier.current.points) : 1} />
                </CardBody>
              </Card>
            </Link>
          )}
          <Card>
            <CardBody className="text-sm text-slate-600">
              Every check-in is checked automatically for quality, then reviewed by your study team. It complements, never replaces, the visits and tests in your study protocol.
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
