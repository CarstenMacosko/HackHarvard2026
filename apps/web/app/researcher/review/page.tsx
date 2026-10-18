import Link from "next/link";
import { ObservationDetail } from "@/components/observation-detail";
import { ReviewActions } from "@/components/review-actions";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Tabs, cn } from "@/components/ui";
import { relTime } from "@/lib/format";
import { listStudies, reviewQueue } from "@/lib/queries";

export const metadata = { title: "Review queue" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ study?: string; id?: string }> }) {
  const { study, id } = await searchParams;
  const [queue, studies] = await Promise.all([reviewQueue(study), listStudies()]);
  const selectedIndex = Math.max(0, queue.findIndex((o) => o.id === id));
  const selected = queue[selectedIndex];
  const next = queue[selectedIndex + 1] ?? queue[selectedIndex - 1];
  const href = (obsId?: string) => `/researcher/review?${new URLSearchParams({ ...(study ? { study } : {}), ...(obsId ? { id: obsId } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Nothing enters the study record until a clinician accepts, corrects or rejects it. Corrections keep the original value in the audit log."
      />
      <Tabs
        items={[
          { href: "/researcher/review", label: "All studies", active: !study },
          ...studies.map((s) => ({ href: `/researcher/review?study=${s.id}`, label: s.name.split(":")[0], active: study === s.id, count: s.pending_reviews })),
        ]}
      />
      {!selected ? (
        <Card>
          <EmptyState title="All caught up">Every CV result in this view has been reviewed.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader title={`${queue.length} awaiting review`} description="Oldest first" />
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {queue.map((o) => (
                <li key={o.id}>
                  <Link href={href(o.id)} className={cn("block px-5 py-2.5 hover:bg-slate-50", o.id === selected.id && "bg-brand-50/70 hover:bg-brand-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {o.participant_name}
                      </span>
                      <span className="text-xs text-slate-400">{relTime(o.captured_at)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{o.study_name}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title={
                <Link href={`/researcher/participants/${selected.participant_id}`} className="hover:text-brand-700">
                  {selected.participant_name}
                </Link>
              }
              description={`${selected.study_name} · ${selected.task_label}`}
            />
            <CardBody>
              <ObservationDetail o={selected} />
              <div className="mt-5">
                <ReviewActions key={selected.id} observation={selected} nextHref={next ? href(next.id) : href()} />
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
