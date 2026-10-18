"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { assignParticipantTasks } from "./actions";

export function AssignTasks({
  participantId,
  tasks,
  enabledTaskIds,
  taskInstructions,
}: {
  participantId: string;
  tasks: { id: string; label: string; module: string; instructions: string }[];
  enabledTaskIds: string[] | null;
  taskInstructions: Record<string, string>;
}) {
  const allIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const [enabled, setEnabled] = useState<string[]>(enabledTaskIds?.length ? enabledTaskIds : allIds);
  const [instructions, setInstructions] = useState<Record<string, string>>(taskInstructions ?? {});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader
        title="Assigned tests"
        description="Toggle which protocol tests this participant should complete. Optionally override the capture instructions they see."
      />
      <CardBody className="space-y-4">
        {tasks.map((t) => {
          const on = enabled.includes(t.id);
          return (
            <div key={t.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={on}
                  onChange={(e) => {
                    setEnabled((xs) => (e.target.checked ? [...xs, t.id] : xs.filter((id) => id !== t.id)));
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.label}</div>
                  <div className="font-mono text-xs text-slate-400">{t.module}</div>
                  {on && (
                    <textarea
                      className="mt-2 min-h-[72px] w-full rounded-md border border-slate-300 p-2 text-sm"
                      placeholder={t.instructions}
                      value={instructions[t.id] ?? ""}
                      onChange={(e) => setInstructions((m) => ({ ...m, [t.id]: e.target.value }))}
                    />
                  )}
                </div>
              </label>
            </div>
          );
        })}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <Button
          disabled={pending || enabled.length === 0}
          onClick={() => {
            start(async () => {
              const r = await assignParticipantTasks({
                participantId,
                enabledTaskIds: enabled,
                taskInstructions: Object.fromEntries(
                  Object.entries(instructions).filter(([id, body]) => enabled.includes(id) && body.trim()),
                ),
              });
              setMsg(r.ok ? "Assignments saved — schedule updated." : r.error);
            });
          }}
        >
          {pending ? "Saving…" : "Assign tests"}
        </Button>
      </CardBody>
    </Card>
  );
}
