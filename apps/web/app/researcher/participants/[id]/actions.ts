"use server";

import { revalidatePath } from "next/cache";
import { backend } from "@/lib/backend";
import { ensureSchedule } from "@/lib/schedule";
import { researcherName } from "@/lib/session";
import { requireOwnedStudy } from "@/lib/study-access";

export async function assignParticipantTasks(input: {
  participantId: string;
  enabledTaskIds: string[];
  taskInstructions: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.enabledTaskIds.length) return { ok: false, error: "Assign at least one test." };
  const db = backend();
  const [p] = await db.participants({ id: input.participantId });
  if (!p) return { ok: false, error: "Participant not found." };
  let study;
  try {
    study = await requireOwnedStudy(p.study_id);
  } catch {
    return { ok: false, error: "Study not found." };
  }
  const valid = new Set(study.protocol.tasks.map((t) => t.id));
  const enabled = input.enabledTaskIds.filter((id) => valid.has(id));
  if (!enabled.length) return { ok: false, error: "No valid protocol tasks selected." };

  const instructions: Record<string, string> = {};
  for (const [id, body] of Object.entries(input.taskInstructions)) {
    if (enabled.includes(id) && body.trim()) instructions[id] = body.trim();
  }

  await db.updateParticipant(p.id, {
    enabled_task_ids: enabled,
    task_instructions: instructions,
  });
  const updated = { ...p, enabled_task_ids: enabled, task_instructions: instructions };
  await ensureSchedule(updated, study);
  await db.insertAudit({
    actor: await researcherName(),
    action: "participant.tasks_assigned",
    entity: "participant",
    entity_id: p.id,
    detail: { enabled_task_ids: enabled },
  });
  revalidatePath(`/researcher/participants/${p.id}`);
  revalidatePath("/participant");
  return { ok: true };
}
