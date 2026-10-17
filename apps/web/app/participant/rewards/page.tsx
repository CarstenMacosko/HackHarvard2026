import { Card, ProgressBar } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";
import { RedeemButton } from "./redeem-button";

export const dynamic = "force-dynamic";

const ALL_BADGES = ["First check-in", "4-period streak", "10 usable submissions", "10-period streak"];

export default async function RewardsPage() {
  const home = await participantHome(await currentParticipantId());
  if (!home || !home.study) return <Card>Join a study to start earning rewards.</Card>;
  const { balance, lifetime, tier, badges, events, redemptions, study } = home;
  const tiers = [...study.protocol.rewards.tiers].sort((a, b) => a.points - b.points);
  const redeemable = tiers.filter((t) => t.points > 0 && t.points <= balance).at(-1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Rewards</h1>
      <Card className="bg-gradient-to-br from-brand-600 to-brand-700 text-white">
        <div className="text-sm text-brand-100">Available points</div>
        <div className="text-4xl font-semibold tabular-nums">{balance}</div>
        <div className="mt-1 text-sm text-brand-100">{tier?.current.name} tier · {lifetime} earned all-time</div>
        {tier?.next && <ProgressBar className="mt-3 bg-white/20" value={(lifetime - tier.current.points) / (tier.next.points - tier.current.points)} />}
        <div className="mt-4"><RedeemButton label={redeemable ? `Redeem ${redeemable.payout_label} (${redeemable.points} pts)` : null} /></div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">How to earn</h2>
        <ul className="space-y-1 text-sm text-slate-600">
          <li>✅ {study.protocol.rewards.base_points} pts for every usable check-in</li>
          <li>⏰ +{study.protocol.rewards.on_time_bonus} pts when you send it on the day it&apos;s due</li>
          <li>🔥 Streak bonus grows each check-in in a row (up to ×{study.protocol.rewards.max_multiplier})</li>
          <li>🏅 Badges for milestones</li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Badges</h2>
        <div className="grid grid-cols-2 gap-2">
          {ALL_BADGES.map((b) => {
            const got = badges.includes(b);
            return (
              <div key={b} className={`rounded-lg border p-3 text-sm ${got ? "border-amber-200 bg-amber-50" : "border-dashed border-slate-200 text-slate-400"}`}>
                <div className="text-xl">{got ? "🏅" : "🔒"}</div>
                {b}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Tiers</h2>
        <ul className="space-y-1.5 text-sm">
          {tiers.map((t) => (
            <li key={t.name} className={`flex justify-between ${t.name === tier?.current.name ? "font-semibold text-brand-700" : "text-slate-600"}`}>
              <span>{t.name} <span className="font-normal text-slate-400">· {t.points} pts</span></span>
              <span>{t.payout_label}</span>
            </li>
          ))}
        </ul>
      </Card>

      {redemptions.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Redeemed</h2>
          <ul className="space-y-1.5 text-sm">
            {redemptions.map((r) => (
              <li key={r.id} className="flex justify-between"><span>{r.payout_label}</span><code className="font-mono text-xs">{r.mock_code}</code></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Simulated codes for the demo. No real payment is issued.</p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Activity</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {events.slice(0, 12).map((e) => (
            <li key={e.id} className="flex justify-between py-1.5">
              <span className="text-slate-600">{e.reason} <span className="text-xs text-slate-400">· {shortDate(e.created_at)}</span></span>
              <span className={`tabular-nums ${e.points < 0 ? "text-rose-600" : "text-emerald-600"}`}>{e.points > 0 ? "+" : ""}{e.points}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
