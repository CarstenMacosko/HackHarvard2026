import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AdherenceChart } from "@/components/charts";
import { FunnelBars } from "@/components/funnel";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th, THead, Tr } from "@/components/ui";
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
        description="Remote visual follow-up across all active studies: participation, data quality and what needs your attention."
        actions={
          <ButtonLink href="/researcher/review" size="md">
            Review {k.pendingReviews} result{k.pendingReviews === 1 ? "" : "s"} <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active participants" value={k.active} hint={`${k.enrolled} enrolled`} />
        <Stat label="Check-ins, last 7 days" value={k.checkins7d} hint="usable submissions" />
        <Stat label="Completion, 30 days" value={pct(k.completion30d)} hint="of due check-ins" tone={k.completion30d < 0.75 ? "warn" : "default"} />
        <Stat label="Usable on first try" value={pct(k.firstTry30d)} hint="quality gate, 30 days" />
        <Stat label="Awaiting review" value={k.pendingReviews} hint="CV results" tone={k.pendingReviews > 10 ? "warn" : "default"} />
        <Stat label="Escalations" value={k.escalations} hint="3 unusable attempts, 14 days" tone={k.escalations ? "bad" : "default"} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Weekly completion rate" description="Share of due check-ins completed with a usable capture" />
          <CardBody>
            <AdherenceChart series={o.adherence.map((a) => ({ name: a.study.name, weeks: a.weeks }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Needs attention" description="Active participants at risk of dropping out" />
          {o.attention.length === 0 ? (
            <EmptyState title="Everyone is on track" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.attention.map(({ participant: p, reasons }) => (
                <li key={p.id}>
                  <Link href={`/researcher/participants/${p.id}`} className="flex items-start justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">{p.display_name}</div>
                      <div className="truncate text-xs text-slate-500">{reasons.join(" · ")}</div>
                    </div>
                    <span className="tabular shrink-0 text-xs text-slate-400">{pct(p.completion_rate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
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
                    <Link href={`/researcher/studies/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">{conditionLabel(s.condition)}</Td>
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

        <Card>
          <CardHeader title="Quality gate, 30 days" description="How captures flowed from attempt to usable data" />
          <CardBody>
            <FunnelBars funnel={o.funnel} />
          </CardBody>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Recent submissions"
            actions={
              <Link href="/researcher/submissions" className="text-xs font-medium text-brand-700 hover:underline">
                Open inbox
              </Link>
            }
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
                    <Link href={`/researcher/participants/${s.participant_id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.participant_name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">{s.study_name}</span>
                  </Td>
                  <Td>{s.accepted ? <Badge tone="green">usable</Badge> : s.escalated ? <Badge tone="red">escalated</Badge> : <Badge tone="amber">retry requested</Badge>}</Td>
                  <Td className="text-slate-600">
                    {s.accepted ? "—" : s.quality.checks.filter((c) => !c.passed).map((c) => CHECK_LABEL[c.name] ?? c.name).join(", ")}
                  </Td>
                  <Td className="tabular">{s.attempt}</Td>
                  <Td className="text-slate-600">{s.source === "web" ? "Web upload" : "Messaging"}</Td>
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
