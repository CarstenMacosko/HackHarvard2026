"use client";

import { DEFAULT_CONSENT, DEFAULT_REMINDERS, TASK_LIBRARY, type Cadence } from "@vf/shared";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, cn } from "@/components/ui";
import type { Condition } from "@/lib/types";
import { createStudy } from "./actions";

const EVALS = [
  { module: "finger_tapping", label: "Finger tapping (video)" },
  { module: "hand_tremor", label: "Hand tremor (video)" },
  { module: "eczema_photo", label: "Skin photo" },
] as const;

const CADENCES: { id: Cadence; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "twice_weekly", label: "Twice weekly" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every two weeks" },
];

const CADENCE_HOURS: Record<Cadence, number> = { daily: 24, twice_weekly: 72, weekly: 168, biweekly: 336 };

type ReminderDraft = { kind: "capture" | "adherence" | "custom"; every_hours: number; message: string; task_module: string };

const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

export function StudyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<Condition>("parkinsons");
  const [consentTitle, setConsentTitle] = useState(DEFAULT_CONSENT.title);
  const [consentBody, setConsentBody] = useState(DEFAULT_CONSENT.body);
  const [evals, setEvals] = useState<{ module: string; cadence: Cadence }[]>([{ module: "finger_tapping", cadence: "weekly" }]);
  const [reminders, setReminders] = useState<ReminderDraft[]>([
    { kind: "adherence", every_hours: DEFAULT_REMINDERS[0].every_hours, message: DEFAULT_REMINDERS[0].message, task_module: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const taskModules = useMemo(() => new Set(evals.map((e) => e.module)), [evals]);

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStudy({ name, condition, consentTitle, consentBody, evals, reminders });
          if (!r.ok) return setError(r.error);
          router.push(`/researcher/studies/${r.id}?tab=participants`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader title="Study" description="Created as active so you can enroll someone in person immediately." />
          <CardBody className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Name
              <input className={cn(input, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder="PD-FOLLOW: post-visit motor checks" required />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Condition
              <select className={cn(input, "mt-1")} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                <option value="parkinsons">Parkinson&apos;s disease</option>
                <option value="eczema">Atopic dermatitis</option>
                <option value="other">Other</option>
              </select>
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consent form" description="Shown on the join link and during in-person enrollment." />
          <CardBody className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Title
              <input className={cn(input, "mt-1")} value={consentTitle} onChange={(e) => setConsentTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Body
              <textarea className="mt-1 min-h-[220px] w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-relaxed" value={consentBody} onChange={(e) => setConsentBody(e.target.value)} />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Required evaluations"
            actions={
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const next = EVALS.find((e) => !taskModules.has(e.module));
                  if (next) setEvals((xs) => [...xs, { module: next.module, cadence: TASK_LIBRARY[next.module].cadence }]);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {evals.map((ev, i) => (
              <div key={`${ev.module}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
                <select
                  className={cn(input, "max-w-xs")}
                  value={ev.module}
                  onChange={(e) => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, module: e.target.value } : x)))}
                >
                  {EVALS.map((opt) => (
                    <option key={opt.module} value={opt.module}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select className={cn(input, "w-44")} value={ev.cadence} onChange={(e) => setEvals((xs) => xs.map((x, j) => (j === i ? { ...x, cadence: e.target.value as Cadence } : x)))}>
                  {CADENCES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="ghost" disabled={evals.length === 1} onClick={() => setEvals((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Message intervals"
            description="Photon texts these on a schedule after the participant messages you first (shared lines cannot start a chat)."
          />
          <CardBody className="space-y-3">
            {reminders.map((r, i) => (
              <div key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
                <div className="flex gap-2">
                  <select className={cn(input)} value={r.kind} onChange={(e) => setReminders((xs) => xs.map((x, j) => (j === i ? { ...x, kind: e.target.value as ReminderDraft["kind"] } : x)))}>
                    <option value="adherence">Medication / pills</option>
                    <option value="capture">Upload check-in</option>
                    <option value="custom">Custom</option>
                  </select>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setReminders((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <label className="block text-xs font-medium text-slate-500">
                  Every (hours)
                  <input
                    className={cn(input, "mt-1")}
                    type="number"
                    min={1}
                    value={r.every_hours}
                    onChange={(e) => setReminders((xs) => xs.map((x, j) => (j === i ? { ...x, every_hours: Number(e.target.value) } : x)))}
                  />
                </label>
                {r.kind === "capture" && (
                  <select className={input} value={r.task_module} onChange={(e) => setReminders((xs) => xs.map((x, j) => (j === i ? { ...x, task_module: e.target.value } : x)))}>
                    <option value="">Which evaluation?</option>
                    {evals.map((ev) => (
                      <option key={ev.module} value={ev.module}>
                        {TASK_LIBRARY[ev.module]?.label ?? ev.module}
                      </option>
                    ))}
                  </select>
                )}
                <textarea className="min-h-[72px] w-full rounded-md border border-slate-300 p-2 text-sm" value={r.message} onChange={(e) => setReminders((xs) => xs.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setReminders((xs) => [...xs, { kind: "adherence", every_hours: 24, message: DEFAULT_REMINDERS[0].message, task_module: "" }])}>
                Add pill reminder
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const ev = evals[0];
                  if (!ev) return;
                  const task = TASK_LIBRARY[ev.module];
                  setReminders((xs) => [
                    ...xs,
                    {
                      kind: "capture",
                      every_hours: CADENCE_HOURS[ev.cadence],
                      message: `Reminder: please upload your ${task.label.toLowerCase()} ${task.media_type}.`,
                      task_module: ev.module,
                    },
                  ]);
                }}
              >
                Add upload reminder
              </Button>
            </div>
          </CardBody>
        </Card>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create study"}
        </Button>
      </div>
    </form>
  );
}
