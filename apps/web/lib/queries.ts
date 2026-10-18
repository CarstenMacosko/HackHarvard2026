import "server-only";
import { badgesEarned, balance, computeStreak, lifetimePoints, tierFor, type Observation, isOpen, type RewardEvent } from "@vf/shared";
import { PRETRAINED } from "@vf/shared/pretrained";
import { currentResearcher } from "./auth";
import { backend } from "./backend";
import { ensureSchedule } from "./schedule";
import { ownedStudyIds } from "./study-access";
import type { Participant, ParticipantSummary, ScheduledTask, Study, StudySummary, Submission } from "./types";

/** Read models for pages. All derived numbers are computed here from raw rows. */

const DAY = 86_400_000;

function completion(tasks: ScheduledTask[]): number | null {
  const due = tasks.filter((t) => !isOpen(t));
  return due.length ? due.filter((t) => t.status === "completed").length / due.length : null;
}

function summarize(p: Participant, study: Study | undefined, tasks: ScheduledTask[], obs: Observation[], rewards: RewardEvent[]): ParticipantSummary {
  const mine = obs.filter((o) => o.participant_id === p.id);
  const myTasks = tasks.filter((t) => t.participant_id === p.id);
  const cadence = study?.protocol.tasks[0]?.cadence ?? "weekly";
  return {
    ...p,
    completion_rate: completion(myTasks),
    streak: computeStreak(mine.map((o) => o.captured_at), cadence),
    last_submission_at: mine.at(-1)?.captured_at ?? null,
    pending_reviews: mine.filter((o) => o.review_status === "pending").length,
    points: balance(rewards.filter((e) => e.participant_id === p.id)),
    escalations: myTasks.filter((t) => t.status === "escalated" && Date.now() - new Date(t.due_at).getTime() < 14 * DAY).length,
  };
}

/** Weekly completion rate for the last `weeks` 7-day buckets (oldest first). */
function weeklyAdherence(tasks: ScheduledTask[], weeks = 6) {
  const now = Date.now();
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const due = tasks.filter((t) => {
      const d = new Date(t.due_at).getTime();
      return d >= start && d < end && !isOpen(t);
    });
    return {
      week: new Date(end).toISOString(),
      rate: due.length ? due.filter((t) => t.status === "completed").length / due.length : null,
      due: due.length,
    };
  });
}

/** How captures flowed through the quality gate. */
export function submissionFunnel(subs: Submission[]) {
  const accepted = subs.filter((s) => s.accepted);
  return {
    attempts: subs.length,
    accepted: accepted.length,
    firstTry: accepted.filter((s) => s.attempt === 1).length,
    afterRetry: accepted.filter((s) => s.attempt > 1).length,
    unusable: subs.filter((s) => !s.accepted).length,
    escalated: subs.filter((s) => s.escalated).length,
    onDevice: subs.filter((s) => s.analysis_runtime === "on-device").length,
  };
}

export async function navCounts() {
  const db = backend();
  const [pending, tasks] = await Promise.all([db.observations({ status: "pending" }), db.scheduledTasks()]);
  return {
    pendingReviews: pending.length,
    escalations: tasks.filter((t) => t.status === "escalated" && Date.now() - new Date(t.due_at).getTime() < 14 * DAY).length,
  };
}

/** Researcher-facing study list — only studies created by the signed-in researcher. */
export async function listStudies(): Promise<StudySummary[]> {
  const db = backend();
  const user = await currentResearcher();
  if (!user) return [];
  const [allStudies, participants, obs, tasks] = await Promise.all([db.studies(), db.participants(), db.observations(), db.scheduledTasks()]);
  const studies = allStudies.filter((s) => s.owner_portal_user_id === user.id);
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
      first_try_usable_rate: so.length ? so.filter((o) => Number(o.context.attempts ?? 1) === 1).length / so.length : null,
    };
  });
}

export async function getStudy(id: string): Promise<Study | undefined> {
  return (await backend().studies()).find((s) => s.id === id);
}

export async function overview() {
  const db = backend();
  const owned = await ownedStudyIds();
  const [studies, allParticipants, allObs, allTasks, allSubs, rewards] = await Promise.all([
    listStudies(),
    db.participants(),
    db.observations(),
    db.scheduledTasks(),
    db.submissions(),
    db.rewardEvents(),
  ]);
  const participants = allParticipants.filter((p) => owned.has(p.study_id));
  const pids = new Set(participants.map((p) => p.id));
  const obs = allObs.filter((o) => owned.has(o.study_id));
  const tasks = allTasks.filter((t) => pids.has(t.participant_id));
  const subs = allSubs.filter((s) => owned.has(s.study_id));
  const now = Date.now();
  const last30 = (iso: string) => now - new Date(iso).getTime() < 30 * DAY;
  const recentObs = obs.filter((o) => last30(o.captured_at));
  const summaries = participants.map((p) =>
    summarize(p, studies.find((s) => s.id === p.study_id), tasks, obs, rewards),
  );
  const names = new Map(participants.map((p) => [p.id, p.display_name]));

  return {
    studies,
    kpis: {
      active: participants.filter((p) => p.status === "active").length,
      enrolled: participants.filter((p) => p.status !== "invited").length,
      checkins7d: subs.filter((s) => s.accepted && now - new Date(s.created_at).getTime() < 7 * DAY).length,
      completion30d: (() => {
        const due = tasks.filter((t) => last30(t.due_at) && !isOpen(t));
        return due.length ? due.filter((t) => t.status === "completed").length / due.length : null;
      })(),
      firstTry30d: recentObs.length ? recentObs.filter((o) => Number(o.context.attempts ?? 1) === 1).length / recentObs.length : null,
      pendingReviews: obs.filter((o) => o.review_status === "pending").length,
      escalations: summaries.reduce((s, p) => s + p.escalations, 0),
    },
    adherence: studies.map((s) => {
      const ids = new Set(participants.filter((p) => p.study_id === s.id).map((p) => p.id));
      return { study: s, weeks: weeklyAdherence(tasks.filter((t) => ids.has(t.participant_id))) };
    }),
    recent: [...subs]
      .reverse()
      .slice(0, 8)
      .map((s) => ({
        ...s,
        participant_name: names.get(s.participant_id) ?? s.participant_id,
        study_name: studies.find((x) => x.id === s.study_id)?.name.split(":")[0] ?? s.study_id,
      })),
    funnel: submissionFunnel(subs.filter((s) => last30(s.created_at))),
  };
}

export async function listParticipants(f: { studyId?: string; status?: string; q?: string } = {}) {
  const db = backend();
  const owned = await ownedStudyIds();
  if (f.studyId && !owned.has(f.studyId)) return [];
  const [allStudies, ps, obs, rewards, tasks] = await Promise.all([
    db.studies(),
    db.participants({ studyId: f.studyId }),
    db.observations(),
    db.rewardEvents(),
    db.scheduledTasks(),
  ]);
  const studies = allStudies.filter((s) => owned.has(s.id));
  const q = f.q?.trim().toLowerCase();
  return ps
    .filter(
      (p) =>
        owned.has(p.study_id) &&
        (!f.status || p.status === f.status) &&
        (!q || p.display_name.toLowerCase().includes(q) || p.id.includes(q) || p.invite_code.toLowerCase().includes(q)),
    )
    .map((p) => {
      const study = studies.find((s) => s.id === p.study_id);
      return { ...summarize(p, study, tasks, obs, rewards), study_name: study?.name ?? p.study_id };
    });
}

export async function studyDetail(id: string) {
  const db = backend();
  const user = await currentResearcher();
  const study = await getStudy(id);
  if (!user || !study || study.owner_portal_user_id !== user.id) return undefined;
  const [participants, subs, models, obs] = await Promise.all([listParticipants({ studyId: id }), db.submissions({ studyId: id }), db.models(), db.observations({ studyId: id })]);
  const tasks = await db.scheduledTasks(participants.map((p) => p.id));
  const modules = new Set(study.protocol.tasks.map((t) => t.module));
  return {
    study,
    participants,
    adherence: weeklyAdherence(tasks),
    funnel: submissionFunnel(subs),
    completion: completion(tasks),
    observations: obs,
    models: models.filter((m) => modules.has(m.module) && (m.study_id === null || m.study_id === id)),
  };
}

export async function getParticipantDetail(id: string) {
  const db = backend();
  const [p] = await db.participants({ id });
  if (!p) return undefined;
  const [study, obs, tasks, rewards, subs] = await Promise.all([getStudy(p.study_id), db.observations({ participantId: id }), db.scheduledTasks([id]), db.rewardEvents(id), db.submissions({ participantId: id })]);
  return { participant: summarize(p, study, tasks, obs, rewards), study, observations: obs, tasks, submissions: subs, rewards };
}

/** Researcher portal: participant detail only when the study is owned by the signed-in researcher. */
export async function researcherParticipantDetail(id: string) {
  const detail = await getParticipantDetail(id);
  if (!detail?.study) return undefined;
  const user = await currentResearcher();
  if (!user || detail.study.owner_portal_user_id !== user.id) return undefined;
  return detail;
}

export async function reviewQueue(studyId?: string) {
  const db = backend();
  const owned = await ownedStudyIds();
  if (studyId && !owned.has(studyId)) return [];
  const [allObs, participants, allStudies] = await Promise.all([db.observations({ status: "pending", studyId }), db.participants(), db.studies()]);
  const studies = allStudies.filter((s) => owned.has(s.id));
  const obs = allObs.filter((o) => owned.has(o.study_id));
  const names = new Map(participants.map((p) => [p.id, p.display_name]));
  const studyNames = new Map(studies.map((s) => [s.id, s.name.split(":")[0]]));
  return obs.map((o) => ({ ...o, participant_name: names.get(o.participant_id) ?? o.participant_id, study_name: studyNames.get(o.study_id) ?? o.study_id }));
}

export async function submissionsInbox(f: { studyId?: string; result?: string } = {}) {
  const db = backend();
  const owned = await ownedStudyIds();
  if (f.studyId && !owned.has(f.studyId)) return { rows: [], funnel: submissionFunnel([]) };
  const [allSubs, participants, allStudies] = await Promise.all([db.submissions({ studyId: f.studyId }), db.participants(), db.studies()]);
  const studies = allStudies.filter((s) => owned.has(s.id));
  const subs = allSubs.filter((s) => owned.has(s.study_id));
  const names = new Map(participants.map((p) => [p.id, p.display_name]));
  const taskLabels = new Map(studies.flatMap((s) => s.protocol.tasks.map((t) => [t.id, t.label] as const)));
  const rows = [...subs]
    .reverse()
    .filter((s) => !f.result || (f.result === "accepted" ? s.accepted : f.result === "escalated" ? s.escalated : !s.accepted))
    .map((s) => ({
      ...s,
      participant_name: names.get(s.participant_id) ?? s.participant_id,
      task_label: taskLabels.get(s.task_id) ?? s.task_id,
    }));
  return { rows, funnel: submissionFunnel(subs) };
}

export async function participantHome(id: string) {
  // the portal is where a participant sees what's due, so bring their check-ins up to date first
  const [p] = await backend().participants({ id });
  if (p) await ensureSchedule(p);
  const detail = await getParticipantDetail(id);
  if (!detail) return undefined;
  const { participant, study, observations, tasks, submissions, rewards: events } = detail;
  const [redemptions] = await Promise.all([backend().redemptions(id)]);
  const rewards = study?.protocol.rewards;
  const lifetime = lifetimePoints(events);
  const now = Date.now();
  const enabled = participant.enabled_task_ids;
  const protocolTasks =
    study && enabled?.length
      ? study.protocol.tasks.filter((t) => enabled.includes(t.id))
      : study?.protocol.tasks ?? [];
  const openScheduled = tasks
    .filter((t) => isOpen(t))
    .filter((t) => !enabled?.length || enabled.includes(t.task_id))
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const dueScheduled = openScheduled.filter(
    (t) => new Date(t.due_at).getTime() - DAY <= now && now <= new Date(t.due_at).getTime() + t.window_hours * 3_600_000,
  );
  const openTask = dueScheduled[0] ?? null;
  const nextTask = openTask ?? openScheduled[0] ?? null;
  const availableTasks = protocolTasks.map((task) => {
    const custom = participant.task_instructions?.[task.id]?.trim();
    const scheduled = openScheduled.find((s) => s.task_id === task.id) ?? null;
    const due =
      scheduled &&
      new Date(scheduled.due_at).getTime() - DAY <= now &&
      now <= new Date(scheduled.due_at).getTime() + scheduled.window_hours * 3_600_000;
    return {
      task: custom ? { ...task, instructions: custom } : task,
      scheduled,
      dueNow: Boolean(due),
    };
  });
  return {
    participant,
    study,
    observations,
    submissions,
    nextTask,
    dueNow: Boolean(openTask),
    availableTasks,
    events: [...events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    redemptions,
    balance: balance(events),
    lifetime,
    tier: rewards ? tierFor(rewards, lifetime) : null,
    badges: badgesEarned(events),
  };
}

export async function modelRegistry() {
  const db = backend();
  const [models, obs, studies] = await Promise.all([db.models(), db.observations(), db.studies()]);
  return {
    studies,
    models: [...models].reverse().map((m) => ({
      // the weights are only needed to apply a model, not to list it
      ...{ ...m, weights: [], feature_means: [], feature_stds: [] },
      n_features: m.features.length,
      study_name: m.study_id ? (studies.find((s) => s.id === m.study_id)?.name ?? m.study_id) : "All studies",
      applied: obs.filter((o) => o.measurements.some((x) => x.name === m.target.name) && o.module === m.module).length,
    })),
  };
}

/** One model with its bundled evaluation and model card, if it came from the training kit or Droid. */
export async function modelDetail(id: string) {
  const db = backend();
  const [model] = await db.models({ id });
  if (!model) return null;
  const [obs, studies] = await Promise.all([db.observations(), db.studies()]);
  const bundled = PRETRAINED.find((e) => e.model.id === id);
  return {
    model,
    study_name: model.study_id ? (studies.find((s) => s.id === model.study_id)?.name ?? model.study_id) : "All studies using the module",
    applied: obs.filter((o) => o.module === model.module && o.measurements.some((x) => x.name === model.target.name)).length,
    evaluation: bundled?.evaluation ?? null,
    card: bundled?.card ?? null,
  };
}
