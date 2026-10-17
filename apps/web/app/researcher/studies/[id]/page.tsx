import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdherenceChart } from "@/components/charts";
import { FunnelBars } from "@/components/funnel";
import { ParticipantTable } from "@/components/participant-table";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, KeyValues, PageHeader, SectionLabel, Stat, Tabs, ValidationBadge } from "@/components/ui";
import { CHECK_LABEL, conditionLabel, pct } from "@/lib/format";
import { studyDetail } from "@/lib/queries";
import { InviteButton } from "./invite-button";

const TABS = ["overview", "participants", "protocol", "data"] as const;

export default async function StudyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const requested = (await searchParams).tab ?? "";
  const tab = (TABS as readonly string[]).includes(requested) ? requested : "overview";
  const d = await studyDetail(id);
  if (!d) notFound();
  const { study, participants } = d;
  const reviewed = d.observations.filter((o) => o.review_status === "accepted" || o.review_status === "corrected").length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Studies", href: "/researcher/studies" }, { label: study.name.split(":")[0] }]}
        title={study.name}
        description={`${conditionLabel(study.condition)} · protocol v${study.protocol.version}, approved by ${study.protocol.approved_by ?? "—"}`}
        actions={
          <>
            <ButtonLink href={`/researcher/review?study=${id}`} variant="secondary">
              Review queue
            </ButtonLink>
            <InviteButton studyId={id} />
          </>
        }
      />
      <Tabs
        items={[
          { href: `/researcher/studies/${id}`, label: "Overview", active: tab === "overview" },
          { href: `/researcher/studies/${id}?tab=participants`, label: "Participants", active: tab === "participants", count: participants.length },
          { href: `/researcher/studies/${id}?tab=protocol`, label: "Protocol", active: tab === "protocol" },
          { href: `/researcher/studies/${id}?tab=data`, label: "Data & export", active: tab === "data" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Active participants" value={`${participants.filter((p) => p.status === "active").length}`} hint={`${participants.length} enrolled or invited`} />
            <Stat label="Completion" value={pct(d.completion)} hint="of due check-ins" />
            <Stat label="Usable on first try" value={pct(d.funnel.firstTry / Math.max(1, d.funnel.accepted))} />
            <Stat label="Reviewed results" value={`${reviewed}/${d.observations.length}`} hint="accepted or corrected" />
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Weekly completion rate" />
              <CardBody>
                <AdherenceChart series={[{ name: study.name, weeks: d.adherence }]} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Quality gate" description="All capture attempts in this study" />
              <CardBody>
                <FunnelBars funnel={d.funnel} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "participants" && (
        <Card>
          <ParticipantTable rows={participants} />
        </Card>
      )}

      {tab === "protocol" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {study.protocol.tasks.map((t) => (
              <Card key={t.id}>
                <CardHeader title={t.label} description={`${t.media_type} · ${t.cadence.replace("_", " ")} · CV module ${t.module}`} />
                <CardBody className="space-y-5">
                  <div>
                    <SectionLabel>Message the participant receives</SectionLabel>
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{t.instructions}</p>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <SectionLabel>Measurements</SectionLabel>
                      <ul className="space-y-1.5 text-sm">
                        {t.measurements.map((m) => (
                          <li key={m.name} className="flex items-center justify-between gap-2">
                            <span>
                              {m.label} <span className="text-slate-400">({m.unit})</span>
                            </span>
                            <ValidationBadge status={m.validation_status} />
                          </li>
                        ))}
                        {d.models
                          .filter((m) => m.module === t.module && m.active)
                          .map((m) => (
                            <li key={m.id} className="flex items-center justify-between gap-2">
                              <span>
                                {m.target.label} <span className="text-slate-400">(custom model v{m.version})</span>
                              </span>
                              <ValidationBadge status={m.status} />
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div>
                      <SectionLabel>Quality gate</SectionLabel>
                      <KeyValues items={Object.entries(t.quality_criteria).map(([k, v]) => [CHECK_LABEL[k.replace(/_(min|max)$/, "")] ?? k, `${k.endsWith("_max") ? "≤" : "≥"} ${v}`])} />
                    </div>
                  </div>
                  <div>
                    <SectionLabel>Patient-reported context</SectionLabel>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                      {t.report_questions.map((q) => (
                        <li key={q.key}>
                          {q.prompt} {q.options && <span className="text-slate-400">({q.options.join(" / ")})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Rewards (simulated)" />
              <CardBody>
                <KeyValues
                  items={[
                    ["Per usable check-in", `${study.protocol.rewards.base_points} pts`],
                    ["On-schedule bonus", `+${study.protocol.rewards.on_time_bonus} pts`],
                    ["Streak multiplier", `+${study.protocol.rewards.streak_step}× per period, max ×${study.protocol.rewards.max_multiplier}`],
                    ...study.protocol.rewards.tiers.map((tier) => [`${tier.name} tier`, `${tier.points} pts · ${tier.payout_label}`] as [string, string]),
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Custom models" description="Researcher-trained heads applied to this study's captures" />
              {d.models.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.models.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                      <span>
                        {m.name} <span className="text-slate-400">v{m.version}</span>
                      </span>
                      {m.active ? <ValidationBadge status={m.status} /> : <Badge>inactive</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No custom models yet" action={<ButtonLink href="/researcher/generate" size="sm" variant="secondary">Generate a candidate</ButtonLink>} />
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Export observations" description="Long format: one row per measurement, with uncertainty, validation status, reviewer, model version and patient report." />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <a href={`/api/export?study=${id}&format=csv`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700">
                  <Download className="h-4 w-4" /> Reviewed results (CSV)
                </a>
                <a href={`/api/export?study=${id}&format=json`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Reviewed results (JSON)
                </a>
                <a href={`/api/export?study=${id}&format=csv&include=all`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Everything, incl. unreviewed (CSV)
                </a>
              </div>
              <p className="text-sm text-slate-500">
                Only accepted or corrected observations enter the analysis export by default; rejected results never do. Each row keeps the model version and the analysis runtime, so results can
                be re-analysed if a model changes.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Record status" />
            <CardBody>
              <KeyValues
                items={[
                  ["Observations", d.observations.length],
                  ["Accepted", d.observations.filter((o) => o.review_status === "accepted").length],
                  ["Corrected", d.observations.filter((o) => o.review_status === "corrected").length],
                  ["Rejected", d.observations.filter((o) => o.review_status === "rejected").length],
                  ["Awaiting review", <Link key="p" href={`/researcher/review?study=${id}`} className="text-brand-700 hover:underline">{d.observations.filter((o) => o.review_status === "pending").length}</Link>],
                ]}
              />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
