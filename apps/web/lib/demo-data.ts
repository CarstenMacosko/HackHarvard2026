import {
  DEFAULT_REWARDS,
  ECZEMA_TASK,
  FINGER_TAPPING_TASK,
  TREMOR_TASK,
  computeStreak,
  rewardsForAcceptedSubmission,
  type Measurement,
  type Observation,
  type QualityCheck,
  type RewardEvent,
  type TaskConfig,
} from "@vf/shared";
import { PRETRAINED_MODELS } from "@vf/shared/pretrained";
import type { AuditEntry, CvModel, Participant, Redemption, ScheduledTask, Study, Submission } from "./types";

/**
 * Deterministic synthetic study data so the whole app runs without Supabase.
 * Six weeks of history per active participant, generated relative to server start.
 * Every record is synthetic; nothing here is real patient data.
 *
 * Mutations (reviews, uploads, trained models) live in this in-memory store until the server
 * restarts. It sits on globalThis so every route handler and page shares one copy.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface DemoState {
  studies: Study[];
  participants: Participant[];
  observations: Observation[];
  submissions: Submission[];
  scheduledTasks: ScheduledTask[];
  rewardEvents: RewardEvent[];
  redemptions: Redemption[];
  models: CvModel[];
  audit: AuditEntry[];
}

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

const STUDIES: Study[] = [
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
  {
    id: "study_tremor",
    name: "PD-TREMOR: rest tremor home monitoring",
    condition: "parkinsons",
    status: "active",
    protocol: { study_id: "study_tremor", version: 1, approved_by: "Dr. A. Rivera", tasks: [TREMOR_TASK], rewards: DEFAULT_REWARDS },
  },
];

const INVITE_PREFIX: Record<string, string> = { study_pd: "PD", study_ad: "AD", study_tremor: "TR" };

interface Profile {
  id: string;
  study: string;
  status: Participant["status"];
  adherence: number; // probability of completing each check-in
  enrolledDaysAgo: number;
  trend: number; // disease trajectory: negative = improving
}

const PROFILES: Profile[] = [
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
  { id: "p_201", study: "study_tremor", status: "active", adherence: 0.9, enrolledDaysAgo: 42, trend: 0.4 },
  { id: "p_202", study: "study_tremor", status: "active", adherence: 0.8, enrolledDaysAgo: 35, trend: -0.3 },
  { id: "p_203", study: "study_tremor", status: "active", adherence: 0.95, enrolledDaysAgo: 28, trend: 0.1 },
  { id: "p_204", study: "study_tremor", status: "invited", adherence: 0, enrolledDaysAgo: 0, trend: 0 },
];

const CADENCE_DAYS = { daily: 1, twice_weekly: 3, weekly: 7, biweekly: 14 } as const;

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

/** A plausible failed attempt: what the quality gate would have said. */
const BLURRY = "The picture is blurry. Rest your phone against something steady and tap the screen to focus first.";

function failedChecks(condition: Study["condition"], r: () => number): QualityCheck[] {
  const dark = r() < 0.5;
  const base: QualityCheck[] = dark
    ? [{ name: "exposure", passed: false, value: 38 + Math.round(r() * 15), threshold: condition === "parkinsons" ? 60 : 70, message: "It's too dark. Turn on a light or face a window (no flash)." }]
    : condition === "parkinsons"
      ? [{ name: "blur", passed: false, value: 12 + Math.round(r() * 30), threshold: 60, message: BLURRY }]
      : [{ name: "blur", passed: false, value: 3 + Math.round(r() * 10), threshold: 15, message: BLURRY }];
  if (condition === "parkinsons" && r() < 0.4) {
    base.push({ name: "hand_visible", passed: false, value: 0.4 + Math.round(r() * 30) / 100, threshold: 0.8, message: "I lost sight of your hand. Keep your whole hand, including your wrist, in the frame the entire time." });
  }
  return base;
}

function generate(): DemoState {
  const NOW = Date.now();
  const state: DemoState = {
    studies: structuredClone(STUDIES),
    participants: [],
    observations: [],
    submissions: [],
    scheduledTasks: [],
    rewardEvents: [],
    redemptions: [],
    models: structuredClone(PRETRAINED_MODELS),
    audit: [],
  };

  PROFILES.forEach((p, i) => {
    state.participants.push({
      id: p.id,
      study_id: p.study,
      display_name: `Participant ${p.id.slice(2)}`,
      // p_001 / p_101 match the messaging agent's demo participants and supabase/seed.sql
      phone: p.status === "invited" ? null : p.id === "p_001" ? "+15550000001" : p.id === "p_101" ? "+15550000002" : `+1555000${String(i + 3).padStart(4, "0")}`,
      invite_code: `${INVITE_PREFIX[p.study]}-${p.id.slice(2)}${p.status === "invited" ? "J" : "X"}`,
      status: p.status,
      enrolled_at: p.enrolledDaysAgo ? new Date(NOW - p.enrolledDaysAgo * DAY).toISOString() : null,
      preferred_time: p.status === "invited" ? null : "18:00",
    });
    if (p.status === "invited") return;

    const study = state.studies.find((s) => s.id === p.study)!;
    const task = study.protocol.tasks[0];
    const r = rng(1000 + i * 7919);
    const every = CADENCE_DAYS[task.cadence];
    const accepted: string[] = [];
    const stopDay = p.status === "withdrawn" ? 12 : p.status === "paused" ? 10 : 0;
    let n = 0;

    for (let day = p.enrolledDaysAgo; day >= stopDay; day -= every) {
      const due = NOW - day * DAY;
      const st: ScheduledTask = {
        id: `st_${p.id}_${n}`,
        participant_id: p.id,
        task_id: task.id,
        due_at: new Date(due).toISOString(),
        window_hours: 48,
        status: "pending",
        completed_at: null,
      };
      state.scheduledTasks.push(st);
      n++;
      if (day < 1) continue; // today's task is still open
      const source: Submission["source"] = r() < 0.7 ? "sms" : "web";
      const runtime: Submission["analysis_runtime"] = source === "sms" ? "server" : "on-device";
      const mediaType = task.media_type;

      if (r() > p.adherence) {
        // missed: sometimes three unusable attempts and an escalation, usually no reply at all
        if (r() < 0.35) {
          for (let a = 1; a <= 3; a++) {
            const checks = failedChecks(study.condition, r);
            state.submissions.push({
              id: `sub_${p.id}_${n}_a${a}`, participant_id: p.id, study_id: p.study, task_id: task.id, scheduled_task_id: st.id,
              attempt: a, source, media_type: mediaType, media_url: null, analysis_runtime: runtime,
              quality: { accepted: false, checks, retry_instructions: `${checks.map((c) => c.message).join(" ")} Then send it again 🙏` },
              accepted: false, observation_id: null, escalated: a === 3, created_at: new Date(due + (3 + a * 0.2) * HOUR).toISOString(),
            });
          }
          st.status = "escalated";
        } else {
          st.status = "missed";
        }
        continue;
      }
      st.status = "completed";
      const t = (p.enrolledDaysAgo - day) / 42; // 0..1 through the follow-up window
      const capturedAt = due + (2 + r() * 20) * HOUR;
      st.completed_at = new Date(capturedAt).toISOString();
      const attempts = r() < 0.22 ? 2 : 1;
      const sub = `sub_${p.id}_${n}`;

      let measurements: Measurement[];
      let report: Observation["patient_report"];
      let checks: QualityCheck[];
      if (task.module === "hand_tremor") {
        const off = r() < 0.25;
        // hand-size units: 0.1 ≈ 1 cm peak-to-peak for a 10 cm hand
        const amp = Math.max(0.01, 0.14 + p.trend * 0.12 * t + (off ? 0.06 : 0) + (r() - 0.5) * 0.04);
        measurements = measure(task, {
          tremor_amplitude: [amp, null],
          tremor_freq_hz: [4.9 + (r() - 0.5) * 0.6, 0.125],
          tremor_power_ratio: [Math.min(0.98, 0.55 + amp * 1.5 + (r() - 0.5) * 0.1), null],
        });
        report = { medication_state: off ? "OFF" : "ON", tremor_today: Math.max(0, Math.min(10, Math.round(amp * 30 + (r() - 0.5) * 3))) };
        checks = [
          { name: "blur", passed: true, value: 90 + Math.round(r() * 80), threshold: 60, message: "" },
          { name: "exposure", passed: true, value: 110 + Math.round(r() * 40), threshold: 200, message: "" },
          { name: "duration_s", passed: true, value: 12 + Math.round(r() * 4), threshold: 8, message: "" },
          { name: "fps", passed: true, value: 30, threshold: 24, message: "" },
          { name: "hand_visible", passed: true, value: Math.round((0.9 + r() * 0.1) * 1000) / 1000, threshold: 0.8, message: "" },
        ];
      } else if (study.condition === "parkinsons") {
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
          { name: "hand_visible", passed: true, value: Math.round((0.9 + r() * 0.1) * 1000) / 1000, threshold: 0.8, message: "" },
        ];
      } else {
        const sev = Math.max(0.05, 0.75 + p.trend * t + (r() - 0.5) * 0.12);
        measurements = measure(task, {
          erythema_index: [6 + sev * 14, 0.3 + r() * 0.3],
          affected_area_pct: [4 + sev * 30, 1.5 + r() * 2],
        });
        report = { itch: Math.max(0, Math.min(10, Math.round(sev * 9 + (r() - 0.5) * 2))), treatment_used: r() < 0.8 ? "Yes" : "No" };
        checks = [
          { name: "blur", passed: true, value: 25 + Math.round(r() * 100), threshold: 15, message: "" },
          { name: "exposure", passed: true, value: 120 + Math.round(r() * 40), threshold: 210, message: "" },
          { name: "skin_coverage", passed: true, value: Math.round((0.4 + r() * 0.4) * 1000) / 1000, threshold: 0.25, message: "" },
        ];
      }

      const ageDays = (NOW - capturedAt) / DAY;
      const reviewRoll = r();
      const review_status: Observation["review_status"] =
        ageDays < 8 ? "pending" : reviewRoll < 0.06 ? "rejected" : reviewRoll < 0.14 ? "corrected" : "accepted";
      const reviewer = review_status === "pending" ? null : study.protocol.approved_by;
      const obsId = `obs_${p.id}_${n}`;

      if (attempts === 2) {
        const failed = failedChecks(study.condition, r);
        state.submissions.push({
          id: `${sub}_a1`, participant_id: p.id, study_id: p.study, task_id: task.id, scheduled_task_id: st.id,
          attempt: 1, source, media_type: mediaType, media_url: null, analysis_runtime: runtime,
          quality: { accepted: false, checks: failed, retry_instructions: `${failed.map((c) => c.message).join(" ")} Then send it again 🙏` },
          accepted: false, observation_id: null, escalated: false, created_at: new Date(capturedAt - (4 + r() * 10) * 60_000).toISOString(),
        });
      }
      state.submissions.push({
        id: sub, participant_id: p.id, study_id: p.study, task_id: task.id, scheduled_task_id: st.id,
        attempt: attempts, source, media_type: mediaType, media_url: null, analysis_runtime: runtime,
        quality: { accepted: true, checks, retry_instructions: null },
        accepted: true, observation_id: obsId, escalated: false, created_at: new Date(capturedAt).toISOString(),
      });

      state.observations.push({
        id: obsId,
        study_id: p.study,
        participant_id: p.id,
        submission_id: sub,
        module: task.module,
        task_label: task.label,
        captured_at: new Date(capturedAt).toISOString(),
        media_url: null,
        quality: { accepted: true, checks, retry_instructions: null },
        measurements,
        features: {},
        model_version: `${task.module}@${task.module === "hand_tremor" ? "0.1.0" : "0.2.0"}`,
        patient_report: report,
        context: { attempts, source, analysis_runtime: runtime, device: r() < 0.6 ? "iPhone 14" : "Pixel 7" },
        review_status,
        reviewer,
        reviewed_at: reviewer ? new Date(capturedAt + 1.5 * DAY).toISOString() : null,
        review_note:
          review_status === "corrected" ? "Amplitude adjusted: partial occlusion in frames 40–80." : review_status === "rejected" ? "Wrong region photographed." : null,
      });
      if (reviewer) {
        state.audit.push({
          id: `aud_${obsId}`, actor: reviewer, action: `review.${review_status}`, entity: "observation", entity_id: obsId,
          detail: { participant_id: p.id }, created_at: new Date(capturedAt + 1.5 * DAY).toISOString(),
        });
      }

      accepted.push(new Date(capturedAt).toISOString());
      const streak = computeStreak(accepted, task.cadence, new Date(capturedAt));
      state.rewardEvents.push(
        ...rewardsForAcceptedSubmission(study.protocol.rewards, {
          participantId: p.id,
          submissionId: sub,
          onTime: capturedAt - due < 24 * HOUR,
          streak,
          totalAccepted: accepted.length,
          at: new Date(capturedAt),
        }),
      );
    }
  });
  state.submissions.sort((a, b) => a.created_at.localeCompare(b.created_at));
  state.audit.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return state;
}

const g = globalThis as typeof globalThis & { __vfDemoState?: DemoState };

export function demoState(): DemoState {
  return (g.__vfDemoState ??= generate());
}
