import { NextResponse } from "next/server";
import { balance, mockRedemptionCode } from "@vf/shared";
import { backend } from "@/lib/backend";
import { getStudy } from "@/lib/queries";
import { currentParticipantId } from "@/lib/session";

/**
 * Simulated redemption: spend points on the best payout the balance covers.
 * Writes a negative ledger entry plus a redemptions row with a fake code. No money moves.
 */
export async function POST() {
  const pid = await currentParticipantId();
  const db = backend();
  const [participant] = await db.participants({ id: pid });
  if (!participant) return NextResponse.json({ error: "Not enrolled" }, { status: 404 });
  const study = await getStudy(participant.study_id);
  const events = await db.rewardEvents(pid);
  const bal = balance(events);

  const options = (study?.protocol.rewards.tiers ?? []).filter((t) => t.points > 0 && t.points <= bal).sort((a, b) => b.points - a.points);
  const tier = options[0];
  if (!tier) return NextResponse.json({ error: "Not enough points yet" }, { status: 400 });

  const now = new Date().toISOString();
  const id = `rdm_${pid}_${Date.now()}`;
  const redemption = { id, participant_id: pid, tier: tier.name, points: tier.points, payout_label: tier.payout_label, mock_code: mockRedemptionCode(id), created_at: now };
  await db.insertRewardEvents([{ id: `${id}:redemption`, participant_id: pid, kind: "redemption", points: -tier.points, reason: `Redeemed ${tier.payout_label}`, created_at: now }]);
  await db.insertRedemption(redemption);
  await db.insertAudit({ actor: pid, action: "reward.redeemed", entity: "redemption", entity_id: id, detail: { tier: tier.name, points: tier.points } });
  return NextResponse.json(redemption);
}
