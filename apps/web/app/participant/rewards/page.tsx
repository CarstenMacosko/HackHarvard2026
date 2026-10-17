import { Award, Lock } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, KeyValues, PageHeader, ProgressBar, Table, Td, Th, THead, Tr } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { participantHome } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";
import { RedeemButton } from "./redeem-button";

export const metadata = { title: "Rewards" };

const ALL_BADGES = ["First check-in", "4-period streak", "10 usable submissions", "10-period streak"];

export default async function RewardsPage() {
  const home = await participantHome(await currentParticipantId());
  if (!home || !home.study) return <Card><EmptyState title="Join a study to start earning rewards" /></Card>;
  const { balance, lifetime, tier, badges, events, redemptions, study } = home;
  const r = study.protocol.rewards;
  const tiers = [...r.tiers].sort((a, b) => a.points - b.points);
  const redeemable = tiers.filter((t) => t.points > 0 && t.points <= balance).at(-1);

  return (
    <>
      <PageHeader title="Rewards" description="Points for every usable check-in. Rewards are simulated in this prototype: codes are not real gift cards." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="border-brand-700 bg-brand-700 text-white">
            <CardBody className="space-y-4 py-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-sm text-brand-100">Available points</div>
                  <div className="tabular text-4xl font-semibold">{balance}</div>
                  <div className="mt-1 text-sm text-brand-100">
                    {tier?.current.name} tier · {lifetime} earned all-time
                  </div>
                </div>
                <div className="w-full max-w-xs">
                  <RedeemButton label={redeemable ? `Redeem ${redeemable.payout_label} (${redeemable.points} pts)` : null} unlockAt={tiers.find((t) => t.points > 0)?.points ?? 0} />
                </div>
              </div>
              {tier?.next && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-brand-100">
                    <span>{tier.current.name}</span>
                    <span>
                      {tier.next.points - lifetime} pts to {tier.next.name}
                    </span>
                  </div>
                  <ProgressBar tone="white" value={(lifetime - tier.current.points) / (tier.next.points - tier.current.points)} />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <Table>
              <THead>
                <Th>When</Th>
                <Th>Why</Th>
                <Th className="text-right">Points</Th>
              </THead>
              <tbody>
                {events.slice(0, 20).map((e) => (
                  <Tr key={e.id}>
                    <Td className="text-slate-600">{shortDate(e.created_at)}</Td>
                    <Td className="text-slate-700">{e.reason}</Td>
                    <Td className={`tabular text-right font-medium ${e.points < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                      {e.points > 0 ? "+" : ""}
                      {e.points}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="How to earn" />
            <CardBody>
              <KeyValues
                items={[
                  ["Usable check-in", `${r.base_points} pts`],
                  ["Sent on the day it's due", `+${r.on_time_bonus} pts`],
                  ["Streak bonus", `up to ×${r.max_multiplier}`],
                  ["Badges", "25–200 pts"],
                ]}
              />
              <p className="mt-2 text-xs text-slate-500">Points are only awarded for usable captures, once per scheduled check-in. Retakes never cost you anything.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Badges" />
            <CardBody className="grid grid-cols-2 gap-2">
              {ALL_BADGES.map((b) => {
                const got = badges.includes(b);
                return (
                  <div key={b} className={`rounded-md border p-3 text-sm ${got ? "border-amber-200 bg-amber-50 text-amber-900" : "border-dashed border-slate-200 text-slate-400"}`}>
                    {got ? <Award className="mb-1 h-5 w-5 text-amber-600" strokeWidth={1.75} /> : <Lock className="mb-1 h-5 w-5" strokeWidth={1.75} />}
                    {b}
                  </div>
                );
              })}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tiers" />
            <CardBody>
              <KeyValues items={tiers.map((t) => [<span key={t.name} className={t.name === tier?.current.name ? "font-semibold text-brand-700" : ""}>{t.name} · {t.points} pts</span>, t.payout_label])} />
            </CardBody>
          </Card>
          {redemptions.length > 0 && (
            <Card>
              <CardHeader title="Redeemed" description="Simulated codes" />
              <CardBody>
                <KeyValues items={redemptions.map((x) => [x.payout_label, <code key={x.id} className="font-mono text-xs">{x.mock_code}</code>])} />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
