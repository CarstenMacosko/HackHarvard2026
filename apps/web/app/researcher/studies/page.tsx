import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th, THead, Tr } from "@/components/ui";
import { CONDITION_LABEL, pct } from "@/lib/format";
import { listStudies } from "@/lib/queries";

export const metadata = { title: "Studies" };

export default async function StudiesPage() {
  const studies = await listStudies();
  return (
    <>
      <PageHeader
        title="Studies"
        description="Each study runs a versioned protocol: which CV module, the capture instructions, the quality gate and the reward rules."
      />
      <Card>
        <Table>
          <THead>
            <Th>Study</Th>
            <Th>Condition</Th>
            <Th>Protocol</Th>
            <Th>Capture tasks</Th>
            <Th className="text-right">Participants</Th>
            <Th className="text-right">Completion</Th>
            <Th className="text-right">First-try usable</Th>
            <Th className="text-right">To review</Th>
          </THead>
          <tbody>
            {studies.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <Link href={`/researcher/studies/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {s.name}
                  </Link>
                  <div className="text-xs text-slate-400">{s.id}</div>
                </Td>
                <Td className="text-slate-600">{CONDITION_LABEL[s.condition]}</Td>
                <Td className="text-slate-600">
                  v{s.protocol.version} · {s.protocol.approved_by}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {s.protocol.tasks.map((t) => (
                      <Badge key={t.id}>
                        {t.media_type} · {t.cadence.replace("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td className="tabular text-right">
                  {s.active} active / {s.participants}
                </Td>
                <Td className="tabular text-right">{pct(s.completion_rate)}</Td>
                <Td className="tabular text-right">{pct(s.first_try_usable_rate)}</Td>
                <Td className="text-right">{s.pending_reviews ? <Badge tone="amber">{s.pending_reviews}</Badge> : <span className="text-slate-400">0</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
