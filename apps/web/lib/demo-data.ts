import {
  DEFAULT_REWARDS,
  ECZEMA_TASK,
  FINGER_TAPPING_TASK,
  computeStreak,
  rewardsForAcceptedSubmission,
  type Measurement,
  type Observation,
  type RewardEvent,
  type TaskConfig,
} from "@vf/shared";
import type { Participant, Redemption, ScheduledTask, Study } from "./types";

/**
 * Deterministic synthetic study data so the whole app runs without Supabase.
 * Six weeks of history per active participant, generated relative to server start.
 * Every record is synthetic; nothing here is real patient data.
 */

const DAY = 86_400_000;
const NOW = Date.now();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const studies: Study[] = [
  {
    id: "study_pd",
    name: "PD-FOLLOW: post-trial motor follow-up",
    condition: "parkinsons",
    status: "active",
    protocol: { study_id: "study_pd", version: 1, approved_by: "Dr. A. Rivera", tasks: [FINGER_TAPPING_TASK], rewards: DEFAULT_REWARDS },
  },
  {
    id: "study_ad",
    name: "AD-SKIN: atopic dermatitis extension follow-up",
    condition: "eczema",
    status: "active",
    protocol: { study_id: "study_ad", version: 1, approved_by: "Dr. M. Chen", tasks: [ECZEMA_TASK], rewards: DEFAULT_REWARDS },
  },
];

interface Profile {
  id: string;
  study: string;
  status: Participant["status"];
  adherence: number; // probability of completing each check-in
  enrolledDaysAgo: number;
  trend: number; // disease trajectory: negative = improving
}

const profiles: Profile[] = [
  { id: "p_001", study: "study_pd", status: "active", adherence: 0.95, enrolledDaysAgo: 42, trend: 0.15 },
  { id: "p_002", study: "study_pd", status: "active", adherence: 0.85, enrolledDaysAgo: 42, trend: 0.05 },
  { id: "p_003", study: "study_pd", status: "active", adherence: 0.7, enrolledDaysAgo: 35, trend: 0.3 },
  { id: "p_004", study: "study_pd", status: "active", adherence: 1, enrolledDaysAgo: 28, trend: 0 },
  { id: "p_005", study: "study_pd", status: "paused", adherence: 0.45, enrolledDaysAgo: 42, trend: 0.1 },
  { id: "p_006", study: "study_pd", status: "invited", adherence: 0, enrolledDaysAgo: 0, trend: 0 },
  { id: "p_101", study: "study_ad", status: "active", adherence: 0.9, enrolledDaysAgo: 42, trend: -0.6 },
  { id: "p_102", study: "study_ad", status: "active", adherence: 0.8, enrolledDaysAgo: 42, trend: -0.3 },
  { id: "p_103", study: "study_ad", status: "active", adherence: 0.65, enrolledDaysAgo: 30, trend: 0.2 },
  { id: "p_104", study: "study_ad", status: "active", adherence: 0.95, enrolledDaysAgo: 21, trend: -0.5 },
  { id: "p_105", study: "study_ad", status: "withdrawn", adherence: 0.4, enrolledDaysAgo: 40, trend: 0 },
  { id: "p_106", study: "study_ad", status: "invited", adherence: 0, enrolledDaysAgo: 0, trend: 0 },
];

const CADENCE_DAYS = { daily: 1, twice_weekly: 3, weekly: 7, biweekly: 14 } as const;

export const participants: Participant[] = profiles.map((p, i) => ({
  id: p.id,
  study_id: p.study,
  display_name: `Participant ${p.id.slice(2)}`,
  phone: p.status === "invited" ? null : `+1555000${String(1000 + i).slice(1)}`,
  invite_code: `${p.study === "study_pd" ? "PD" : "AD"}-${p.id.slice(2)}${p.status === "invited" ? "J" : "X"}`,
  status: p.status,
  enrolled_at: p.enrolledDaysAgo ? new Date(NOW - p.enrolledDaysAgo * DAY).toISOString() : null,
  preferred_time: p.status === "invited" ? null : "18:00",
}));

export const observations: Observation[] = [];
export const scheduledTasks: ScheduledTask[] = [];
export const rewardEvents: RewardEvent[] = [];
export const redemptions: Redemption[] = [];

function measure(task: TaskConfig, values: Record<string, [number, number | null]>): Measurement[] {
  return task.measurements.map((m) => ({
    name: m.name,
    label: m.label,
    unit: m.unit,
    value: Math.round(values[m.name][0] * 1000) / 1000,
    uncertainty: values[m.name][1] === null ? null : Math.round((values[m.name][1] as number) * 1000) / 1000,
    validation_status: m.validation_status,
  }));
}

function generate(p: Profile, seed: number) {
  if (p.status === "invited") return;
  const study = studies.find((s) => s.id === p.study)!;
  const task = study.protocol.tasks[0];
  const r = rng(seed);
  const every = CADENCE_DAYS[task.cadence];
  const accepted: string[] = [];
  const stopDay = p.status === "withdrawn" ? 12 : p.status === "paused" ? 10 : 0;
  let n = 0;

  for (let day = p.enrolledDaysAgo; day >= stopDay; day -= every) {
    const due = NOW - day * DAY;
    const st: ScheduledTask = { id: `st_${p.id}_${n}`, participant_id: p.id, task_id: task.id, due_at: new Date(due).toISOString(), status: "pending" };
    scheduledTasks.push(st);
    n++;
    if (day < 1) continue; // today's task is still open
    if (r() > p.adherence) {
      st.status = "missed";
      continue;
    }
    st.status = "completed";
    const t = (p.enrolledDaysAgo - day) / 42; // 0..1 through the follow-up window
    const capturedAt = due + (2 + r() * 20) * 3_600_000;
    const firstTryFailed = r() < 0.22;
    const attempts = firstTryFailed ? 2 : 1;
    const sub = `sub_${p.id}_${n}`;

    let measurements: Measurement[];
    let report: Observation["patient_report"];
    let checks: Observation["quality"]["checks"];
    if (study.condition === "parkinsons") {
      const off = r() < 0.25;
      const rate = 3.6 - p.trend * 1.2 * t - (off ? 0.5 : 0) + (r() - 0.5) * 0.35;
      const amp = 0.95 - p.trend * 0.3 * t - (off ? 0.12 : 0) + (r() - 0.5) * 0.08;
      measurements = measure(task, {
        tap_rate_hz: [rate, 0.08 + r() * 0.08],
        amplitude_norm: [amp, 0.03 + r() * 0.03],
        amplitude_decrement: [8 + p.trend * 30 * t + (off ? 6 : 0) + (r() - 0.5) * 6, null],
        rhythm_cv: [0.08 + p.trend * 0.1 * t + r() * 0.04, null],
      });
      report = { medication_state: off ? "OFF" : "ON", hand: "Right" };
      checks = [
        { name: "blur", passed: true, value: 90 + Math.round(r() * 80), threshold: 60, message: "" },
        { name: "exposure", passed: true, value: 110 + Math.round(r() * 40), threshold: 200, message: "" },
        { name: "duration_s", passed: true, value: 10 + Math.round(r() * 3), threshold: 8, message: "" },
        { name: "fps", passed: true, value: 30, threshold: 20, message: "" },
        { name: "hand_visible", passed: true, value: 0.9 + r() * 0.1, threshold: 0.8, message: "" },
      ];
    } else {
      const sev = Math.max(0.05, 0.75 + p.trend * t + (r() - 0.5) * 0.12);
      measurements = measure(task, {
        erythema_index: [6 + sev * 14, 0.3 + r() * 0.3],
        affected_area_pct: [4 + sev * 30, 1.5 + r() * 2],
      });
      report = { itch: Math.max(0, Math.min(10, Math.round(sev * 9 + (r() - 0.5) * 2))), treatment_used: r() < 0.8 ? "Yes" : "No" };
      checks = [
        { name: "blur", passed: true, value: 120 + Math.round(r() * 100), threshold: 80, message: "" },
        { name: "exposure", passed: true, value: 120 + Math.round(r() * 40), threshold: 210, message: "" },
        { name: "skin_coverage", passed: true, value: 0.4 + r() * 0.4, threshold: 0.25, message: "" },
      ];
    }

    const ageDays = (NOW - capturedAt) / DAY;
    const reviewRoll = r();
    const review_status: Observation["review_status"] =
      ageDays < 5 ? "pending" : reviewRoll < 0.06 ? "rejected" : reviewRoll < 0.14 ? "corrected" : "accepted";
    const reviewer = review_status === "pending" ? null : study.protocol.approved_by;

    observations.push({
      id: `obs_${p.id}_${n}`,
      study_id: p.study,
      participant_id: p.id,
      submission_id: sub,
      module: task.module,
      task_label: task.label,
      captured_at: new Date(capturedAt).toISOString(),
      media_url: null,
      quality: { accepted: true, checks, retry_instructions: null },
      measurements,
      model_version: `${task.module}@0.1.0`,
      patient_report: report,
      context: { attempts, device: r() < 0.6 ? "iPhone 14" : "Pixel 7" },
      review_status,
      reviewer,
      reviewed_at: reviewer ? new Date(capturedAt + 1.5 * DAY).toISOString() : null,
      review_note:
        review_status === "corrected" ? "Amplitude adjusted: partial occlusion in frames 40–80." : review_status === "rejected" ? "Wrong region photographed." : null,
    });

    accepted.push(new Date(capturedAt).toISOString());
    const streak = computeStreak(accepted, task.cadence, new Date(capturedAt));
    rewardEvents.push(
      ...rewardsForAcceptedSubmission(study.protocol.rewards, {
        participantId: p.id,
        submissionId: sub,
        onTime: capturedAt - due < 24 * 3_600_000,
        streak,
        totalAccepted: accepted.length,
        at: new Date(capturedAt),
      }),
    );
  }
}

profiles.forEach((p, i) => generate(p, 1000 + i * 7919));
