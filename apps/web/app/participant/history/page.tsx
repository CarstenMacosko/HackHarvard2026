import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { CHECK_LABEL, dateTime } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const home = await participantHome(await currentParticipantId());
  if (!home) return <Card><EmptyState title="Join a study first" action={<ButtonLink href="/participant/join">Join</ButtonLink>} /></Card>;
  const review = new Map(home.observations.map((o) => [o.id, o.review_status]));
  const points = new Map<string, number>();
  for (const e of home.events) {
    const sub = e.id.split(":")[0];
    points.set(sub, (points.get(sub) ?? 0) + e.points);
  }
  const rows = [...home.submissions].reverse();
  return (
    <>
      <PageHeader title="Your check-ins" description="Every capture you've sent, including retakes. Your study team reviews each usable one." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nothing yet" action={<ButtonLink href="/participant/check-in">Start your first check-in</ButtonLink>} />
        ) : (
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Result</Th>
              <Th>Details</Th>
              <Th>Review</Th>
              <Th className="text-right">Points</Th>
            </THead>
            <tbody>
              {rows.map((s) => {
                const r = s.observation_id ? review.get(s.observation_id) : undefined;
                return (
                  <Tr key={s.id}>
                    <Td className="whitespace-nowrap text-slate-700">{dateTime(s.created_at)}</Td>
                    <Td>{s.accepted ? <Badge tone="green">usable</Badge> : <Badge tone="amber">retake</Badge>}</Td>
                    <Td className="text-slate-600">
                      {s.accepted ? `Attempt ${s.attempt}` : s.quality.checks.filter((c) => !c.passed && !c.advisory).map((c) => CHECK_LABEL[c.name] ?? c.name).join(", ")}
                    </Td>
                    <Td>
                      {s.accepted ? (
                        r === "pending" ? <Badge tone="amber">with your care team</Badge> : r === "rejected" ? <Badge tone="red">couldn&apos;t be used</Badge> : <Badge tone="green">reviewed</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="tabular text-right">{points.get(s.id) ? `+${points.get(s.id)}` : "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
