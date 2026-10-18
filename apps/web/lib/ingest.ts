import "server-only";
import {
  computeStreak,
  isOpen,
  nextDueAt,
  type Observation,
  type RewardEvent,
  type TaskConfig,
} from "@vf/shared";
import { backend } from "./backend";
import type { AnalysisResult } from "./cv-service";
import { ensureSchedule } from "./schedule";
import type { CaptureRecord, Participant, ScheduledTask, Study, Submission } from "./types";

/**
 * The single path every capture takes, from the web upload page or the messaging agent:
 * record the attempt → (if usable) create a pending observation from module measurements
 * only, schedule the next check-in → audit.
 * Decisions are made here; the writes happen together in one transaction (record_capture).
 */

export const MAX_ATTEMPTS = 3;

export interface IngestInput {
  participant: Participant;
  study: Study;
  task: TaskConfig;
  analysis: AnalysisResult;
  runtime: Submission["analysis_runtime"];
  source: Submission["source"];
  mediaUrl: string | null;
  patientReport: Observation["patient_report"];
  context?: Observation["context"];
  capturedAt?: string;
  attempt?: number;
  observationId?: string;
}

export interface IngestResult {
  submission: Submission;
  observation: Observation | null;
  reward_events: RewardEvent[];
  streak: number;
  points_balance: number;
  /** confirmation for the participant (success note or retry instructions) */
  message: string;
  completed_scheduled_task: boolean;
}

const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** The check-in this capture counts toward: the earliest open task whose window includes now. */
export function currentScheduledTask(tasks: ScheduledTask[], taskId: string, now: number): ScheduledTask | null {
  const open = tasks
    .filter((t) => t.task_id === taskId && isOpen(t))
    .filter((t) => {
      const due = new Date(t.due_at).getTime();
      return due - 24 * 3_600_000 <= now && now <= due + t.window_hours * 3_600_000;
    })
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  return open[0] ?? null;
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const db = backend();
  const { participant: p, study, task, analysis } = input;
  if (!analysis.model_version.startsWith(`${task.module}@`)) {
    throw new Error(`analysis from ${analysis.model_version} does not match task module ${task.module}`);
  }
  // a retried request (e.g. the agent re-posting an analysis) returns the original outcome
  if (input.observationId) {
    const [existing] = await db.observations({ id: input.observationId });
    if (existing) return replay(existing);
  }
  const nowIso = input.capturedAt ?? new Date().toISOString();
  const now = new Date(nowIso).getTime();
  const [tasks, priorSubs] = await Promise.all([ensureSchedule(p, study, new Date(now)), db.submissions({ participantId: p.id })]);
  const scheduled = currentScheduledTask(tasks, task.id, now);

  // attempts since the last usable capture of this task
  const mine = priorSubs.filter((s) => s.task_id === task.id);
  const lastAccepted = [...mine].reverse().find((s) => s.accepted);
  const attempt = input.attempt ?? mine.filter((s) => !lastAccepted || s.created_at > lastAccepted.created_at).length + 1;

  const accepted = analysis.quality.accepted;
  const submission: Submission = {
    id: id("sub"),
    participant_id: p.id,
    study_id: study.id,
    task_id: task.id,
    scheduled_task_id: scheduled?.id ?? null,
    attempt,
    source: input.source,
    media_type: task.media_type,
    media_url: input.mediaUrl,
    analysis_runtime: input.runtime,
    quality: analysis.quality,
    accepted,
    observation_id: null,
    escalated: !accepted && attempt >= MAX_ATTEMPTS,
    created_at: nowIso,
  };

  let observation: Observation | null = null;
  const events: RewardEvent[] = [];
  let streak = 0;
  let message = analysis.quality.retry_instructions ?? "That one wasn't usable. Please try again.";
  let close: CaptureRecord["scheduled_task"] = null;

  if (accepted) {
    observation = {
      id: input.observationId ?? id("obs"),
      study_id: study.id,
      participant_id: p.id,
      submission_id: submission.id,
      module: task.module,
      task_label: task.label,
      captured_at: nowIso,
      media_url: input.mediaUrl,
      quality: analysis.quality,
      // Module-native measurements only (no trained-head / severity predictions).
      measurements: analysis.measurements,
      features: analysis.features,
      model_version: analysis.model_version,
      patient_report: input.patientReport,
      context: {
        ...input.context,
        attempts: attempt,
        source: input.source,
        analysis_runtime: input.runtime,
      },
      review_status: "pending",
      reviewer: null,
      reviewed_at: null,
      review_note: null,
    };
    submission.observation_id = observation.id;

    const acceptedTimes = [...(await db.observations({ participantId: p.id })).map((o) => o.captured_at), nowIso];
    streak = computeStreak(acceptedTimes, task.cadence, new Date(now));
    if (scheduled) {
      close = { id: scheduled.id, status: "completed", completed_at: nowIso };
      message = streak > 1 ? `Usable capture ✅ Thanks! That's ${streak} in a row.` : "Usable capture ✅ Thanks — sent to your study team for review.";
    } else {
      message = "Usable capture ✅ Thanks! This check-in was already complete; the extra capture still helps the study.";
    }
  } else if (submission.escalated && scheduled) {
    close = { id: scheduled.id, status: "escalated" };
    message = `${message} If it still doesn't work, try again later or contact your study team.`;
  }

  const result = await db.recordCapture({
    submission,
    observation,
    reward_events: events,
    scheduled_task: close,
    // the next check-in for this task, one cadence period after the one just closed
    next_task: close && scheduled ? { participant_id: p.id, task_id: task.id, due_at: nextDueAt(scheduled.due_at, task.cadence, new Date(now)), window_hours: scheduled.window_hours } : null,
    audit: {
      actor: p.id,
      action: accepted ? "submission.accepted" : submission.escalated ? "submission.escalated" : "submission.rejected",
      entity: "submission",
      entity_id: submission.id,
      detail: { task_id: task.id, attempt, runtime: input.runtime, source: input.source, observation_id: observation?.id ?? null },
    },
  });

  return {
    submission,
    observation,
    reward_events: events,
    streak,
    points_balance: 0,
    message,
    completed_scheduled_task: Boolean(accepted && scheduled && result.scheduled_task_updated),
  };
}

/** The outcome of a capture that was already recorded. */
async function replay(o: Observation): Promise<IngestResult> {
  const db = backend();
  const [submission] = await db.submissions({ id: o.submission_id });
  return {
    submission,
    observation: o,
    reward_events: [],
    streak: 0,
    points_balance: 0,
    message: "Usable capture ✅ (already received)",
    completed_scheduled_task: Boolean(submission?.scheduled_task_id),
  };
}
