import Link from "next/link";
import { notFound } from "next/navigation";
import { AdherenceChart } from "@/components/charts";
import { FunnelBars } from "@/components/funnel";
import { ParticipantTable } from "@/components/participant-table";
import { ButtonLink, Card, CardBody, CardHeader, KeyValues, PageHeader, SectionLabel, Stat, Tabs, ValidationBadge } from "@/components/ui";
import { CHECK_LABEL, conditionLabel, pct } from "@/lib/format";
import { studyDetail } from "@/lib/queries";
import { DeleteStudyButton } from "./delete-study-button";
import { ExportCsvModal } from "@/components/export-csv-modal";
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
            <DeleteStudyButton studyId={id} studyName={study.name} />
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
                    <SectionLabel>Instructions shown to the participant</SectionLabel>
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">{t.instructions}</p>
                  </div>
                  <div>
                    <SectionLabel>Clinical questionnaire (after capture)</SectionLabel>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                      {t.report_questions.map((q) => (
                        <li key={q.key}>
                          {q.prompt}{" "}
                          {q.type === "choice" && q.options ? <span className="text-slate-400">({q.options.join(" / ")})</span> : q.type === "scale" ? <span className="text-slate-400">(0–10)</span> : null}
                        </li>
                      ))}
                    </ul>
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
                      </ul>
                    </div>
                    <div>
                      <SectionLabel>Quality gate</SectionLabel>
                      <KeyValues items={Object.entries(t.quality_criteria).map(([k, v]) => [CHECK_LABEL[k.replace(/_(min|max)$/, "")] ?? k, `${k.endsWith("_max") ? "≤" : "≥"} ${v}`])} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Export submissions"
              description="Researcher-only CSV. One row per measurement, linked by IDs (no display names or media URLs). Clinical answers stay in patient_report JSON."
              actions={<ExportCsvModal studyId={id} />}
            />
            <CardBody className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <p>
                Use <span className="font-medium text-slate-900 dark:text-slate-100">Export CSV</span> to choose which review statuses to include (accepted, corrected, pending, rejected). Defaults to reviewed results only.
              </p>
              <p className="text-xs text-slate-500">
                Columns include study/participant/observation/submission IDs, module, measurements, quality failures, review fields, model version, attempt/source, note IDs, and notes JSON.
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
