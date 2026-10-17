import Link from "next/link";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { CONDITION_LABEL, pct } from "@/lib/format";
import { listStudies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function StudiesPage() {
  const studies = await listStudies();
  return (
    <>
      <PageHeader title="Studies" subtitle="Remote visual follow-up across your active protocols" />
      <div className="grid gap-4 md:grid-cols-2">
        {studies.map((s) => (
          <Link key={s.id} href={`/researcher/studies/${s.id}`}>
            <Card className="transition hover:border-brand-500">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    {CONDITION_LABEL[s.condition]} · protocol v{s.protocol.version}
                  </div>
                </div>
                <Badge tone="green">{s.status}</Badge>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Active" value={`${s.active}/${s.participants}`} />
                <Stat label="Completion" value={pct(s.completion_rate)} hint="of due check-ins" />
                <Stat label="Usable 1st try" value={pct(s.first_try_usable_rate)} />
                <Stat label="To review" value={s.pending_reviews} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
