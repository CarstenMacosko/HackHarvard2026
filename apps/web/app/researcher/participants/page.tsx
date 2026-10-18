import { ParticipantTable } from "@/components/participant-table";
import { Card, PageHeader, buttonClass, cn, fieldClass } from "@/components/ui";
import { listParticipants, listStudies } from "@/lib/queries";

export const metadata = { title: "Participants" };

const STATUSES = ["active", "invited", "paused", "withdrawn", "completed"];

export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<{ study?: string; status?: string; q?: string }> }) {
  const f = await searchParams;
  const [rows, studies] = await Promise.all([listParticipants({ studyId: f.study || undefined, status: f.status || undefined, q: f.q }), listStudies()]);
  const select = cn(fieldClass, "h-9");
  return (
    <>
      <PageHeader title="Participants" description="Everyone enrolled or invited across your studies. Filter, then open a participant to see their timeline and capture history." />
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <input name="q" defaultValue={f.q} placeholder="Search name, ID or invite code" className={cn(fieldClass, "h-9 w-64")} />
        <select name="study" defaultValue={f.study ?? ""} className={select}>
          <option value="">All studies</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.split(":")[0]}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} className={select}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className={buttonClass({ variant: "secondary" })}>Apply</button>
        <span className="ml-auto text-sm text-slate-500">{rows.length} participants</span>
      </form>
      <Card>
        <ParticipantTable rows={rows} showStudy />
      </Card>
    </>
  );
}
