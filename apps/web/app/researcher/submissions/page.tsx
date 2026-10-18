import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs, Td, Th, THead, Tr } from "@/components/ui";
import { CHECK_LABEL, dateTime } from "@/lib/format";
import { listStudies, submissionsInbox } from "@/lib/queries";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ study?: string; result?: string }> }) {
  const f = await searchParams;
  const [{ rows }, studies] = await Promise.all([submissionsInbox({ studyId: f.study, result: f.result }), listStudies()]);
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ study: f.study, result: f.result, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/researcher/submissions${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <PageHeader
        title="Submissions"
        description="Every capture attempt, usable or not. Unusable attempts show what the quality gate caught and the instructions the participant received."
      />
      <Tabs
        items={[
          { href: q({ result: undefined }), label: "All", active: !f.result },
          { href: q({ result: "accepted" }), label: "Usable", active: f.result === "accepted" },
          { href: q({ result: "rejected" }), label: "Unusable", active: f.result === "rejected" },
        ]}
      />
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <Link href={q({ study: undefined })} className={`rounded-md px-2 py-1 ring-1 ring-inset ${!f.study ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
          All studies
        </Link>
        {studies.map((s) => (
          <Link key={s.id} href={q({ study: s.id })} className={`rounded-md px-2 py-1 ring-1 ring-inset ${f.study === s.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
            {s.name.split(":")[0]}
          </Link>
        ))}
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No submissions match" />
        ) : (
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Participant</Th>
              <Th>Task</Th>
              <Th>Attempt</Th>
              <Th>Result</Th>
              <Th>Quality gate</Th>
              <Th>Channel</Th>
              <Th>Analysed</Th>
            </THead>
            <tbody>
              {rows.slice(0, 200).map((s) => (
                <Tr key={s.id}>
                  <Td className="whitespace-nowrap text-slate-600">{dateTime(s.created_at)}</Td>
                  <Td>
                    <Link href={`/researcher/participants/${s.participant_id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.participant_name}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">{s.task_label}</Td>
                  <Td className="tabular">{s.attempt}</Td>
                  <Td>{s.accepted ? <Badge tone="green">usable</Badge> : <Badge tone="amber">retry</Badge>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.quality.checks
                        .filter((c) => (!s.accepted ? !c.passed && !c.advisory : true))
                        .slice(0, 3)
                        .map((c) => (
                          <Badge key={c.name} tone={c.passed ? "slate" : c.advisory ? "amber" : "red"}>
                            {CHECK_LABEL[c.name] ?? c.name}
                          </Badge>
                        ))}
                    </div>
                  </Td>
                  <Td className="text-slate-600">Web</Td>
                  <Td className="text-slate-600">{s.analysis_runtime === "on-device" ? "On-device" : "CV service"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {rows.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing the latest 200 of {rows.length}.</p>}
    </>
  );
}
