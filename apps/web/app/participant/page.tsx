import Link from "next/link";
import { Badge, Card, ProgressBar, REVIEW_TONE } from "@/components/ui";
import { relTime, shortDate } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ParticipantHome() {
  const home = await participantHome(await currentParticipantId());
  if (!home) {
    return (
      <Card>
        <p>We couldn&apos;t find your enrollment.</p>
        <Link href="/participant/join" className="mt-3 inline-block text-brand-600">Join with an invite code →</Link>
      </Card>
    );
  }
  const { participant: p, study, observations, nextTask, balance, lifetime, tier } = home;
  const task = study?.protocol.tasks[0];
  const toNext = tier?.next ? tier.next.points - lifetime : 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{study?.name}</p>
        <h1 className="text-2xl font-semibold">Hi, {p.display_name.replace("Participant ", "#")} 👋</h1>
      </div>

      <Card className="bg-brand-600 text-white">
        <div className="text-sm text-brand-100">Next check-in</div>
        <div className="mt-1 text-lg font-semibold">{task?.label ?? "—"}</div>
        <div className="mt-1 text-sm text-brand-100">
          {nextTask ? `Due ${relTime(nextTask.due_at)} · we'll text you at ${p.preferred_time ?? "your chosen time"}` : "Nothing due right now"}
        </div>
        <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">💬 {task?.instructions}</p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center"><div className="text-2xl font-semibold">🔥 {p.streak}</div><div className="text-xs text-slate-500">streak</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-semibold">{balance}</div><div className="text-xs text-slate-500">points</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-semibold">{Math.round(p.completion_rate * 100)}%</div><div className="text-xs text-slate-500">completed</div></Card>
      </div>

      {tier && (
        <Link href="/participant/rewards">
          <Card className="hover:border-brand-500">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{tier.current.name} tier</span>
              <span className="text-slate-500">{tier.next ? `${toNext} pts to ${tier.next.name}` : "Top tier!"}</span>
            </div>
            <ProgressBar className="mt-2" value={tier.next ? (lifetime - tier.current.points) / (tier.next.points - tier.current.points) : 1} />
          </Card>
        </Link>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Your recent check-ins</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {[...observations].reverse().slice(0, 6).map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <span>{shortDate(o.captured_at)} · {o.task_label}</span>
              <Badge tone={REVIEW_TONE[o.review_status]}>{o.review_status === "pending" ? "with your care team" : o.review_status === "accepted" || o.review_status === "corrected" ? "reviewed ✓" : "needs redo"}</Badge>
            </li>
          ))}
          {!observations.length && <li className="py-2 text-slate-500">No check-ins yet. Your first one earns a bonus!</li>}
        </ul>
      </Card>
      <p className="px-1 text-xs text-slate-400">Viewing as a demo participant. Switch: <Link className="underline" href="/participant/join?as=p_001">PD</Link> · <Link className="underline" href="/participant/join?as=p_101">Eczema</Link></p>
    </div>
  );
}
