import { isOpen } from "@vf/shared";
import { notFound } from "next/navigation";
import { backend } from "@/lib/backend";
import { ScoreBadge, scoreOf } from "@/components/score";
import { Timeline } from "@/components/timeline";
import { Badge, Card, CardBody, CardHeader, PageHeader, STATUS_TONE, Stat, Table, Td, Th, THead, Tr } from "@/components/ui";
import { CHECK_LABEL, dateTime, pct, relTime, shortDate } from "@/lib/format";
import { getParticipantDetail } from "@/lib/queries";

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, messages] = await Promise.all([getParticipantDetail(id), backend().messages(id, 30)]);
  if (!d) notFound();
  const { participant: p, study, observations, tasks, submissions } = d;
  const past = tasks.filter((t) => !isOpen(t)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const TASK_COLOR = { completed: "bg-emerald-500", missed: "bg-rose-300", escalated: "bg-rose-600", pending: "bg-slate-200",
  prompted: "bg-slate-300" } as const;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Participants", href: "/researcher/participants" },
          { label: study?.name.split(":")[0] ?? p.study_id, href: `/researcher/studies/${p.study_id}` },
          { label: p.display_name },
        ]}
        title={
          <span className="flex items-center gap-3">
            {p.display_name} <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
          </span>
        }
        description={`Enrolled ${p.enrolled_at ? shortDate(p.enrolled_at) : "—"} · reminders at ${p.preferred_time ?? "—"} · ${p.phone ?? "no phone linked"}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Completion" value={pct(p.completion_rate)} tone={p.completion_rate < 0.75 && p.status === "active" ? "warn" : "default"} />
        <Stat label="Current streak" value={p.streak} />
        <Stat label="Observations" value={observations.length} />
        <Stat label="Awaiting review" value={p.pending_reviews} />
        <Stat label="Escalations (14 d)" value={p.escalations} tone={p.escalations ? "bad" : "default"} />
        <Stat label="Last check-in" value={relTime(p.last_submission_at)} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Longitudinal timeline" description="Every point links to its source submission, quality checks, patient report and model version" />
        <CardBody>
          <Timeline observations={observations} />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Capture attempts" description="Including unusable attempts and the instructions the participant received" />
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Attempt</Th>
              <Th>Result</Th>
              <Th>Score</Th>
              <Th>Failed checks</Th>
              <Th>Channel</Th>
              <Th>Analysed</Th>
            </THead>
            <tbody>
              {[...submissions].reverse().map((s) => (
                <Tr key={s.id}>
                  <Td className="whitespace-nowrap text-slate-600">{dateTime(s.created_at)}</Td>
                  <Td className="tabular">{s.attempt}</Td>
                  <Td>{s.accepted ? <Badge tone="green">usable</Badge> : s.escalated ? <Badge tone="red">escalated</Badge> : <Badge tone="amber">retry</Badge>}</Td>
                  <Td>
                    <ScoreBadge value={(() => { const o = observations.find((x) => x.id === s.observation_id); return o ? scoreOf(o) : null; })()} />
                  </Td>
                  <Td className="text-slate-600">{s.quality.checks.filter((c) => !c.passed && !c.advisory).map((c) => CHECK_LABEL[c.name] ?? c.name).join(", ") || "—"}</Td>
                  <Td className="text-slate-600">{s.source === "web" ? "Web upload" : "Messaging"}</Td>
                  <Td className="text-slate-600">{s.analysis_runtime === "on-device" ? "On-device" : "CV service"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Adherence" description="Each square is a scheduled check-in" />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {past.map((t) => (
                <div key={t.id} title={`${shortDate(t.due_at)}: ${t.status}`} className={`h-6 w-6 rounded ${TASK_COLOR[t.status]}`} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-500" />completed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-300" />missed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-600" />escalated after 3 unusable attempts</span>
            </div>
          </CardBody>
        </Card>
      </div>
      {messages.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Messages" description="The latest texts between the participant and the study's messaging agent" />
          <CardBody className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "bg-slate-100 text-slate-800" : "bg-brand-600 text-white"}`}>
                  {m.body ?? (m.media_path ? "📎 attachment" : "")}
                  {m.body && m.media_path && <div className="mt-1 text-xs opacity-75">📎 attachment</div>}
                  <div className={`mt-0.5 text-[11px] ${m.direction === "outbound" ? "text-slate-400" : "text-brand-100"}`}>{dateTime(m.created_at)}</div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}
