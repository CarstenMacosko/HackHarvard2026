"use server";

import { revalidatePath } from "next/cache";
import {
  DEFAULT_CONSENT,
  DEFAULT_REWARDS,
  Protocol,
  captureReminderFor,
  clinicalQuestionsForModule,
  type Cadence,
  type ReminderConfig,
  type ReportQuestion,
  type TaskConfig,
} from "@vf/shared";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { taskConfigForModule } from "@/lib/created-modules";
import { researcherName } from "@/lib/session";
import type { Condition, Study } from "@/lib/types";

export interface CreateStudyInput {
  name: string;
  condition: Condition;
  evals: {
    module: string;
    cadence: Cadence;
    report_questions?: ReportQuestion[];
    instructions?: string;
    guide_steps?: string[];
  }[];
  reminders: { kind: ReminderConfig["kind"]; every_hours: number; message: string; task_module?: string }[];
}

export async function createStudy(input: CreateStudyInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const owner = await currentResearcher();
  if (!owner) return { ok: false, error: "Sign in as a researcher to create a study." };
  const name = input.name.trim();
  if (name.length < 3) return { ok: false, error: "Give the study a name." };
  if (!input.evals.length) return { ok: false, error: "Choose at least one required evaluation." };

  const tasks: TaskConfig[] = [];
  for (const ev of input.evals) {
    const base = await taskConfigForModule(ev.module, ev.cadence);
    if (!base) {
      return {
        ok: false,
        error:
          ev.module.startsWith("gen_") || input.condition === "focal_hand_dystonia"
            ? `Unknown evaluation ${ev.module}. Approve a generated module under Generate module first.`
            : `Unknown evaluation ${ev.module}`,
      };
    }
    const questions = (ev.report_questions?.length ? ev.report_questions : clinicalQuestionsForModule(ev.module)).map((q, i) => ({
      key: q.key.trim() || `q_${i}`,
      prompt: q.prompt.trim(),
      type: q.type,
      options: q.type === "choice" ? (q.options?.length ? q.options : ["Yes", "No"]) : undefined,
    }));
    if (questions.some((q) => !q.prompt)) return { ok: false, error: "Every clinical-form question needs a prompt." };
    const instructions = (ev.instructions ?? base.instructions).trim();
    if (!instructions) return { ok: false, error: "Each evaluation needs capture instructions." };
    const guide_steps = (ev.guide_steps ?? base.guide_steps ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!guide_steps.length) return { ok: false, error: "Add at least one numbered capture step for each evaluation." };
    tasks.push({ ...base, cadence: ev.cadence, report_questions: questions, instructions, guide_steps });
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
    consent: DEFAULT_CONSENT,
    reminders,
  });
  const study: Study = {
    id,
    name,
    condition: input.condition,
    status: "active",
    protocol,
    owner_portal_user_id: owner.id,
  };
  const db = backend();
  await db.insertStudy(study);
  await db.insertAudit({ actor: by, action: "study.created", entity: "study", entity_id: id, detail: { evals: tasks.map((t) => t.id) } });
  revalidatePath("/researcher/studies");
  return { ok: true, id };
}
