import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Observation, type TaskConfig } from "@vf/shared";
import type { ParticipantRecord } from "./store";

export interface AnalyzeArgs {
  participant: ParticipantRecord;
  task: TaskConfig;
  submissionId: string;
  mediaUrl: string;
  attempt: number;
}

const CV_URL = process.env.CV_SERVICE_URL ?? "";

/** Sends media to the CV service; MOCK_CV=1 (or no CV_SERVICE_URL) fails the first attempt, then passes. */
export async function analyze(a: AnalyzeArgs): Promise<Observation> {
  const body = {
    module: a.task.module,
    media_url: a.mediaUrl,
    study_id: a.participant.studyId,
    participant_id: a.participant.id,
    submission_id: a.submissionId,
    task_label: a.task.label,
    quality_criteria: a.task.quality_criteria,
    context: { attempt: a.attempt },
  };
  if (process.env.MOCK_CV === "1" || !CV_URL) return mockObservation(a, body);

  let res: Response;
  if (/^https?:\/\//.test(a.mediaUrl)) {
    res = await fetch(`${CV_URL}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    // dev: local file path from the stdin adapter
    const form = new FormData();
    form.set("file", new Blob([await readFile(a.mediaUrl)]), basename(a.mediaUrl));
    form.set("request", JSON.stringify({ ...body, media_url: null }));
    res = await fetch(`${CV_URL}/analyze/upload`, { method: "POST", body: form });
  }
  if (!res.ok) throw new Error(`CV service ${res.status}: ${await res.text()}`);
  return Observation.parse(await res.json());
}

function mockObservation(a: AnalyzeArgs, body: { study_id: string; participant_id: string; submission_id: string }): Observation {
  const accepted = a.attempt > 1;
  return {
    id: `obs_mock_${Date.now()}`,
    ...body,
    module: a.task.module,
    task_label: a.task.label,
    captured_at: new Date().toISOString(),
    media_url: a.mediaUrl,
    quality: {
      accepted,
      checks: [{ name: "blur", passed: accepted, value: accepted ? 140 : 22, threshold: 60, message: "The picture is blurry." }],
      retry_instructions: accepted ? null : "The picture is blurry. Rest your phone against something steady and tap the screen to focus first. Then send it again 🙏",
    },
    measurements: accepted
      ? a.task.measurements.map((m) => ({ ...m, value: Math.round(Math.random() * 1000) / 100, uncertainty: 0.2 }))
      : [],
    model_version: `${a.task.module}@mock`,
    patient_report: {},
    context: { attempt: a.attempt },
    review_status: "pending",
    reviewer: null,
    reviewed_at: null,
    review_note: null,
  };
}
