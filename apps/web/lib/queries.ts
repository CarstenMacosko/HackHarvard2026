import "server-only";
import {
  badgesEarned,
  balance,
  computeStreak,
  lifetimePoints,
  tierFor,
  type Observation,
  type RewardEvent,
} from "@vf/shared";
import { backend } from "./backend";
import type { Participant, ParticipantSummary, ScheduledTask, Study, StudySummary } from "./types";

/** Read models for pages. All derived numbers are computed here from raw rows. */

function completion(tasks: ScheduledTask[]): number {
  const due = tasks.filter((t) => t.status !== "pending");
  return due.length ? due.filter((t) => t.status === "completed").length / due.length : 0;
}

function summarize(p: Participant, study: Study | undefined, tasks: ScheduledTask[], obs: Observation[], rewards: RewardEvent[]): ParticipantSummary {
  const mine = obs.filter((o) => o.participant_id === p.id);
  const cadence = study?.protocol.tasks[0]?.cadence ?? "weekly";
  return {
    ...p,
    completion_rate: completion(tasks.filter((t) => t.participant_id === p.id)),
    streak: computeStreak(mine.map((o) => o.captured_at), cadence),
    last_submission_at: mine.at(-1)?.captured_at ?? null,
    pending_reviews: mine.filter((o) => o.review_status === "pending").length,
    points: balance(rewards.filter((e) => e.participant_id === p.id)),
  };
}

export async function listStudies(): Promise<StudySummary[]> {
  const db = backend();
  const [studies, participants, obs, tasks] = await Promise.all([db.studies(), db.participants(), db.observations(), db.scheduledTasks()]);
  return studies.map((s) => {
    const ps = participants.filter((p) => p.study_id === s.id);
    const ids = new Set(ps.map((p) => p.id));
    const so = obs.filter((o) => o.study_id === s.id);
    return {
      ...s,
      participants: ps.length,
      active: ps.filter((p) => p.status === "active").length,
      completion_rate: completion(tasks.filter((t) => ids.has(t.participant_id))),
      pending_reviews: so.filter((o) => o.review_status === "pending").length,
      first_try_usable_rate: so.length ? so.filter((o) => Number(o.context.attempts ?? 1) === 1).length / so.length : 0,
    };
  });
}

export async function getStudy(id: string): Promise<Study | undefined> {
  return (await backend().studies()).find((s) => s.id === id);
}

export async function listParticipants(studyId: string): Promise<ParticipantSummary[]> {
  const db = backend();
  const [study, ps, obs, rewards] = await Promise.all([getStudy(studyId), db.participants({ studyId }), db.observations({ studyId }), db.rewardEvents()]);
  const tasks = await db.scheduledTasks(ps.map((p) => p.id));
  return ps.map((p) => summarize(p, study, tasks, obs, rewards));
}

export async function getParticipantDetail(id: string) {
  const db = backend();
  const [p] = await db.participants({ id });
  if (!p) return undefined;
  const [study, obs, tasks, rewards] = await Promise.all([getStudy(p.study_id), db.observations({ participantId: id }), db.scheduledTasks([id]), db.rewardEvents(id)]);
  return { participant: summarize(p, study, tasks, obs, rewards), study, observations: obs, tasks };
}

export async function reviewQueue(studyId?: string) {
  const db = backend();
  const [obs, participants] = await Promise.all([db.observations({ status: "pending", studyId }), db.participants({ studyId })]);
  const names = new Map(participants.map((p) => [p.id, p.display_name]));
  return obs.map((o) => ({ ...o, participant_name: names.get(o.participant_id) ?? o.participant_id }));
}

export async function participantHome(id: string) {
  const detail = await getParticipantDetail(id);
  if (!detail) return undefined;
  const { participant, study, observations, tasks } = detail;
  const db = backend();
  const [events, redemptions] = await Promise.all([db.rewardEvents(id), db.redemptions(id)]);
  const rewards = study?.protocol.rewards;
  const lifetime = lifetimePoints(events);
  const nextTask = tasks.filter((t) => t.status === "pending").sort((a, b) => a.due_at.localeCompare(b.due_at))[0] ?? null;
  return {
    participant,
    study,
    observations,
    nextTask,
    events: [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    redemptions,
    balance: balance(events),
    lifetime,
    tier: rewards ? tierFor(rewards, lifetime) : null,
    badges: badgesEarned(events),
  };
}
