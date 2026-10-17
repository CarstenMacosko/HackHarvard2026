import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { cvServiceUrl } from "@/lib/cv-service";
import { relTime } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";
import { CheckIn } from "./check-in";

export const metadata = { title: "Check in" };

export default async function CheckInPage() {
  const home = await participantHome(await currentParticipantId());
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
  const task = home.study.protocol.tasks[0];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/participant" }, { label: "Check in" }]}
        title={task.label}
        description={
          home.dueNow && home.nextTask
            ? `Due ${relTime(home.nextTask.due_at)}. Your phone checks the ${task.media_type} before anything is sent.`
            : `Nothing is due right now. Extra check-ins are welcome but don't earn points.`
        }
      />
      <CheckIn task={task} dueNow={home.dueNow} serverAnalysis={Boolean(cvServiceUrl())} />
    </>
  );
}
