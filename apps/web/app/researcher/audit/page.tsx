import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { backend } from "@/lib/backend";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

const TONE = (action: string) =>
  action.endsWith("rejected") || action.endsWith("escalated") ? "red" : action.endsWith("corrected") || action.startsWith("model") ? "blue" : action.endsWith("accepted") ? "green" : "slate";

export default async function AuditPage() {
  const rows = await backend().audit({ limit: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of reviews, captures, invitations and model changes: who did what, when, to which record." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No events yet" />
        ) : (
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Record</Th>
              <Th>Detail</Th>
            </THead>
            <tbody>
              {rows.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap text-slate-600">{dateTime(a.created_at)}</Td>
                  <Td className="text-slate-700">{a.actor}</Td>
                  <Td>
                    <Badge tone={TONE(a.action)}>{a.action}</Badge>
                  </Td>
                  <Td className="font-mono text-xs text-slate-600">
                    {a.entity}/{a.entity_id}
                  </Td>
                  <Td className="max-w-md truncate font-mono text-xs text-slate-500">{a.detail ? JSON.stringify(a.detail) : ""}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
