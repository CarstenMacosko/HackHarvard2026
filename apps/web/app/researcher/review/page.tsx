import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { ObservationDetail } from "@/components/observation-detail";
import { ReviewActions } from "@/components/review-actions";
import { relTime } from "@/lib/format";
import { listStudies, reviewQueue } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ study?: string }> }) {
  const { study } = await searchParams;
  const [queue, studies] = await Promise.all([reviewQueue(study), listStudies()]);

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle="Nothing enters the study record until a clinician accepts, corrects, or rejects it."
        action={
          <div className="flex gap-1 text-sm">
            <Link href="/researcher/review" className={`rounded-md px-3 py-1.5 ${!study ? "bg-slate-200" : "hover:bg-slate-100"}`}>All</Link>
            {studies.map((s) => (
              <Link key={s.id} href={`/researcher/review?study=${s.id}`} className={`rounded-md px-3 py-1.5 ${study === s.id ? "bg-slate-200" : "hover:bg-slate-100"}`}>
                {s.id === "study_pd" ? "PD-FOLLOW" : s.id === "study_ad" ? "AD-SKIN" : s.name}
              </Link>
            ))}
          </div>
        }
      />
      {queue.length === 0 && <Card><p className="text-sm text-slate-500">All caught up 🎉</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {queue.map((o) => (
          <Card key={o.id}>
            <div className="mb-3 flex items-center justify-between">
              <Link href={`/researcher/participants/${o.participant_id}`} className="font-semibold text-brand-600 hover:underline">{o.participant_name}</Link>
              <span className="text-xs text-slate-500">submitted {relTime(o.captured_at)}</span>
            </div>
            <ObservationDetail o={o} />
            <div className="mt-4"><ReviewActions observation={o} /></div>
          </Card>
        ))}
      </div>
    </>
  );
}
