import type { Cadence, RewardConfig, RewardEvent, RewardEventKind, RewardTier } from "./schemas";

/**
 * Simulated reward engine. Points are only earned for *accepted* submissions so the
 * incentive rewards usable data, not attempts. Pure functions; callers persist the
 * returned events to the append-only reward_events ledger.
 */

export const DEFAULT_REWARDS: RewardConfig = {
  base_points: 50,
  on_time_bonus: 10,
  streak_step: 0.1,
  max_multiplier: 2,
  tiers: [
    { name: "Bronze", points: 0, payout_label: "Thank-you card" },
    { name: "Silver", points: 300, payout_label: "$10 gift card" },
    { name: "Gold", points: 800, payout_label: "$25 gift card" },
    { name: "Platinum", points: 1500, payout_label: "$50 gift card" },
  ],
};

export const PERIOD_DAYS: Record<Cadence, number> = {
  twice_daily: 0.5,
  daily: 1,
  twice_weekly: 3,
  weekly: 7,
  biweekly: 14,
};

const DAY_MS = 86_400_000;

/**
 * Consecutive schedule periods with at least one accepted submission, counting back from
 * the current period. The current period may still be open, so a streak survives until a
 * whole period passes with nothing accepted.
 */
export function computeStreak(acceptedAt: string[], cadence: Cadence, now: Date = new Date()): number {
  if (acceptedAt.length === 0) return 0;
  const len = PERIOD_DAYS[cadence] * DAY_MS;
  const nowIdx = Math.floor(now.getTime() / len);
  const periods = new Set(acceptedAt.map((t) => Math.floor(new Date(t).getTime() / len)));
  let idx = periods.has(nowIdx) ? nowIdx : nowIdx - 1;
  let streak = 0;
  while (periods.has(idx)) {
    streak++;
    idx--;
  }
  return streak;
}

export function streakMultiplier(config: RewardConfig, streak: number): number {
  return Math.min(1 + config.streak_step * Math.max(streak - 1, 0), config.max_multiplier);
}

export interface AcceptedSubmission {
  participantId: string;
  submissionId: string;
  onTime: boolean;
  /** streak including this submission */
  streak: number;
  /** accepted submissions so far including this one */
  totalAccepted: number;
  at?: Date;
}

const BADGES: { id: string; label: string; points: number; earned: (s: AcceptedSubmission) => boolean }[] = [
  { id: "first_submission", label: "First check-in", points: 25, earned: (s) => s.totalAccepted === 1 },
  { id: "streak_4", label: "4-period streak", points: 75, earned: (s) => s.streak === 4 },
  { id: "streak_10", label: "10-period streak", points: 200, earned: (s) => s.streak === 10 },
  { id: "ten_submissions", label: "10 usable submissions", points: 100, earned: (s) => s.totalAccepted === 10 },
];

export function rewardsForAcceptedSubmission(config: RewardConfig, s: AcceptedSubmission): RewardEvent[] {
  const at = (s.at ?? new Date()).toISOString();
  let n = 0;
  const ev = (kind: RewardEventKind, points: number, reason: string): RewardEvent => ({
    id: `${s.submissionId}:${kind}:${n++}`,
    participant_id: s.participantId,
    kind,
    points,
    reason,
    created_at: at,
  });

  const events = [ev("submission_accepted", config.base_points, "Usable submission")];
  if (s.onTime) events.push(ev("on_time_bonus", config.on_time_bonus, "Submitted on schedule"));
  const mult = streakMultiplier(config, s.streak);
  const streakBonus = Math.round(config.base_points * (mult - 1));
  if (streakBonus > 0) events.push(ev("streak_bonus", streakBonus, `${s.streak}-period streak (×${mult.toFixed(1)})`));
  for (const b of BADGES) if (b.earned(s)) events.push(ev("badge", b.points, `Badge: ${b.label}`));
  return events;
}

export function balance(events: RewardEvent[]): number {
  return events.reduce((sum, e) => sum + e.points, 0);
}

/** Lifetime points earned decides the tier, so redeeming never drops a participant a tier. */
export function lifetimePoints(events: RewardEvent[]): number {
  return events.filter((e) => e.points > 0).reduce((sum, e) => sum + e.points, 0);
}

export function tierFor(config: RewardConfig, lifetime: number): { current: RewardTier; next: RewardTier | null } {
  const sorted = [...config.tiers].sort((a, b) => a.points - b.points);
  let current = sorted[0];
  for (const t of sorted) if (lifetime >= t.points) current = t;
  const next = sorted.find((t) => t.points > lifetime) ?? null;
  return { current, next };
}

export function badgesEarned(events: RewardEvent[]): string[] {
  return events.filter((e) => e.kind === "badge").map((e) => e.reason.replace(/^Badge: /, ""));
}

/** One-line confirmation the messaging agent sends after an accepted submission. */
export function rewardMessage(events: RewardEvent[], streak: number): string {
  const pts = balance(events);
  const badge = events.find((e) => e.kind === "badge");
  const streakText = streak > 1 ? `, ${streak}-check-in streak 🔥` : "";
  return `+${pts} pts${streakText}${badge ? ` · ${badge.reason}` : ""}`;
}

/** Fake gift-card code for simulated redemptions. Not a real payment instrument. */
export function mockRedemptionCode(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `DEMO-${hex.slice(0, 4)}-${hex.slice(4)}`;
}
