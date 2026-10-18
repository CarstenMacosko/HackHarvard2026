import Link from "next/link";
import { ButtonLink, Card, CardBody, cardClass, cn, EmptyState, PageHeader } from "@/components/ui";
import { cvServiceUrl } from "@/lib/cv-service";
import { relTime } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { requireParticipant } from "@/lib/require-participant";
import { resolveTask } from "@/lib/schedule";
import { CheckIn } from "./check-in";

export const metadata = { title: "Check in" };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const sp = await searchParams;
  const participant = await requireParticipant();
  const home = await participantHome(participant.id);
  if (!home || !home.study) {
    return (
      <Card>
        <EmptyState title="Join a study first" action={<ButtonLink href="/participant/join">Join with an invite code</ButtonLink>} />
      </Card>
    );
  }
  if (home.participant.status !== "active") {
    return (
      <Card>
        <EmptyState title={`Your participation is ${home.participant.status}`}>Contact your study coordinator if you think this is a mistake.</EmptyState>
      </Card>
    );
  }

  const requested = sp.task?.trim();
  const picked =
    (requested && home.availableTasks.find((x) => x.task.id === requested)) ||
    home.availableTasks.find((x) => x.dueNow) ||
    home.availableTasks[0];

  if (!picked) {
    return (
      <Card>
        <EmptyState title="No tests assigned">Your study team has not assigned a test to you yet.</EmptyState>
      </Card>
    );
  }

  // If multiple tests and none selected, show picker first.
  if (!requested && home.availableTasks.length > 1) {
    return (
      <>
        <PageHeader
          breadcrumbs={[{ label: "Home", href: "/participant" }, { label: "Check in" }]}
          title="Choose a test"
          description="Pick the check-in your study team assigned. Each test uses its own instructions and CV model."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {home.availableTasks.map(({ task, dueNow, scheduled }) => (
            <Link
              key={task.id}
              href={`/participant/check-in?task=${encodeURIComponent(task.id)}`}
              className={cn(cardClass, "p-5 transition-shadow hover:shadow-card-hover hover:ring-brand-300 dark:hover:ring-brand-500/50")}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{task.label}</div>
              <p className="mt-1 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">{task.instructions}</p>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {dueNow && scheduled ? `Due ${relTime(scheduled.due_at)}` : scheduled ? `Opens ${relTime(scheduled.due_at)}` : "Available anytime"}
                {" · "}
                <span className="font-mono">{task.module}</span>
              </div>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const task =
    resolveTask(home.study, picked.task.id, home.participant) ?? picked.task;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/participant" },
          { label: "Check in", href: "/participant/check-in" },
          { label: task.label },
        ]}
        title={task.label}
        description={
          picked.dueNow && picked.scheduled
            ? `Due ${relTime(picked.scheduled.due_at)}. Guided by the ${task.module} model before anything is sent.`
            : `Using the ${task.module} model for live guidance and measurement.`
        }
      />
      {home.availableTasks.length > 1 && (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Switch test:</span>
            {home.availableTasks.map(({ task: t }) => (
              <Link
                key={t.id}
                href={`/participant/check-in?task=${encodeURIComponent(t.id)}`}
                className={t.id === task.id ? "font-medium text-brand-700 dark:text-brand-300" : "text-slate-600 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"}
              >
                {t.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
      <CheckIn task={task} dueNow={picked.dueNow} serverAnalysis={Boolean(cvServiceUrl())} />
    </>
  );
}
