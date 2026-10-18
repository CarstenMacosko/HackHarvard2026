"use server";

import { revalidatePath } from "next/cache";
import {
  DEFAULT_CONSENT,
  DEFAULT_REWARDS,
  Protocol,
  TASK_LIBRARY,
  captureReminderFor,
  clinicalQuestionsForModule,
  type Cadence,
  type ReminderConfig,
  type ReportQuestion,
  type TaskConfig,
} from "@vf/shared";
import { backend } from "@/lib/backend";
import { researcherName } from "@/lib/session";
import type { Condition, Study } from "@/lib/types";

export interface CreateStudyInput {
  name: string;
  condition: Condition;
  consentTitle: string;
  consentBody: string;
  evals: { module: string; cadence: Cadence; report_questions?: ReportQuestion[] }[];
  reminders: { kind: ReminderConfig["kind"]; every_hours: number; message: string; task_module?: string }[];
}

export async function createStudy(input: CreateStudyInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await researcherName();
  } catch {
    return { ok: false, error: "Sign in as a researcher to create a study." };
  }
  const name = input.name.trim();
  if (name.length < 3) return { ok: false, error: "Give the study a name." };
  if (!input.evals.length) return { ok: false, error: "Choose at least one required evaluation." };
  if (!input.consentBody.trim()) return { ok: false, error: "Consent form text is required." };

  const tasks: TaskConfig[] = [];
  for (const ev of input.evals) {
    const base = TASK_LIBRARY[ev.module];
    if (!base) return { ok: false, error: `Unknown evaluation ${ev.module}` };
    const questions = (ev.report_questions?.length ? ev.report_questions : clinicalQuestionsForModule(ev.module)).map((q, i) => ({
      key: q.key.trim() || `q_${i}`,
      prompt: q.prompt.trim(),
      type: q.type,
      options: q.type === "choice" ? (q.options?.length ? q.options : ["Yes", "No"]) : undefined,
    }));
    if (questions.some((q) => !q.prompt)) return { ok: false, error: "Every clinical-form question needs a prompt." };
    tasks.push({ ...structuredClone(base), cadence: ev.cadence, report_questions: questions });
  }

  const reminders: ReminderConfig[] = input.reminders
    .filter((r) => r.message.trim() && r.every_hours > 0)
    .map((r, i) => {
      const task = r.task_module ? tasks.find((t) => t.module === r.task_module) : undefined;
      if (r.kind === "capture" && task) {
        return { ...captureReminderFor(task, r.every_hours), message: r.message.trim() };
      }
      return {
        id: `${r.kind}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        kind: r.kind,
        every_hours: r.every_hours,
        message: r.message.trim(),
        task_id: task?.id ?? null,
      };
    });

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const id = `study_${slug}_${Date.now().toString(36).slice(-4)}`;
  const by = await researcherName();
  const protocol = Protocol.parse({
    study_id: id,
    version: 1,
    approved_by: by,
    tasks,
    rewards: DEFAULT_REWARDS,
    consent: { title: input.consentTitle.trim() || DEFAULT_CONSENT.title, body: input.consentBody.trim() },
    reminders,
  });
  const study: Study = { id, name, condition: input.condition, status: "active", protocol };
  const db = backend();
  await db.insertStudy(study);
  await db.insertAudit({ actor: by, action: "study.created", entity: "study", entity_id: id, detail: { evals: tasks.map((t) => t.id) } });
  revalidatePath("/researcher/studies");
  return { ok: true, id };
}
