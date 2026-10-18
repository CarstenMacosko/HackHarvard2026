import Link from "next/link";
import { AdherenceChart } from "@/components/charts";
import { FunnelBars } from "@/components/funnel";
import { Badge, Card, CardBody, CardHeader, PageHeader, Stat, Table, Td, Th, THead, Tr } from "@/components/ui";
import { CHECK_LABEL, conditionLabel, pct, relTime } from "@/lib/format";
import { overview } from "@/lib/queries";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const o = await overview();
  const k = o.kpis;
  return (
    <>
      <PageHeader
        title="Overview"
        description="Remote visual follow-up across all active studies: participation, data quality and what to review."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Active participants" value={k.active} hint={`${k.enrolled} enrolled`} />
        <Stat label="Check-ins, last 7 days" value={k.checkins7d} hint="usable submissions" />
        <Stat label="Completion, 30 days" value={pct(k.completion30d)} hint="of due check-ins" tone={k.completion30d != null && k.completion30d < 0.75 ? "warn" : "default"} />
        <Stat label="Usable on first try" value={pct(k.firstTry30d)} hint="quality gate, 30 days" />
        <Stat label="Awaiting review" value={k.pendingReviews} hint="CV results" tone={k.pendingReviews > 10 ? "warn" : "default"} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Weekly completion rate" description="Share of due check-ins completed with a usable capture" />
          <CardBody>
            <AdherenceChart series={o.adherence.map((a) => ({ name: a.study.name, weeks: a.weeks }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quality gate, 30 days" description="How captures flowed from attempt to usable data" />
          <CardBody>
            <FunnelBars funnel={o.funnel} />
          </CardBody>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Studies"
            actions={
              <Link href="/researcher/studies" className="text-xs font-medium text-brand-700 hover:underline">
                All studies
              </Link>
            }
          />
          <Table>
            <THead>
              <Th>Study</Th>
              <Th>Condition</Th>
              <Th className="text-right">Active</Th>
              <Th className="text-right">Completion</Th>
              <Th className="text-right">First-try usable</Th>
              <Th className="text-right">To review</Th>
            </THead>
            <tbody>
              {o.studies.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/researcher/studies/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700 dark:text-slate-100">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="text-slate-600 dark:text-slate-400">{conditionLabel(s.condition)}</Td>
                  <Td className="tabular text-right">
                    {s.active}/{s.participants}
                  </Td>
                  <Td className="tabular text-right">{pct(s.completion_rate)}</Td>
                  <Td className="tabular text-right">{pct(s.first_try_usable_rate)}</Td>
                  <Td className="text-right">{s.pending_reviews ? <Badge tone="amber">{s.pending_reviews}</Badge> : <span className="text-slate-400">0</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Recent submissions"
          />
          <Table>
            <THead>
              <Th>Participant</Th>
              <Th>Result</Th>
              <Th>Why</Th>
              <Th>Attempt</Th>
              <Th>Channel</Th>
              <Th className="text-right">When</Th>
            </THead>
            <tbody>
              {o.recent.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/researcher/participants/${s.participant_id}`} className="font-medium text-slate-900 hover:text-brand-700 dark:text-slate-100">
                      {s.participant_name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">{s.study_name}</span>
                  </Td>
                  <Td>{s.accepted ? <Badge tone="green">usable</Badge> : <Badge tone="amber">retry requested</Badge>}</Td>
                  <Td className="text-slate-600 dark:text-slate-400">
                    {s.accepted ? "—" : s.quality.checks.filter((c) => !c.passed && !c.advisory).map((c) => CHECK_LABEL[c.name] ?? c.name).join(", ")}
                  </Td>
                  <Td className="tabular">{s.attempt}</Td>
                  <Td className="text-slate-600 dark:text-slate-400">{s.source === "web" ? "Web upload" : "Upload"}</Td>
                  <Td className="text-right text-slate-500">{relTime(s.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
