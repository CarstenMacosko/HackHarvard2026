"use client";

import { DEFAULT_CONSENT, TASK_LIBRARY, type Cadence } from "@vf/shared";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Card, CardBody, CardHeader, cn } from "@/components/ui";
import type { Condition } from "@/lib/types";
import { createStudy } from "./actions";

const EVALS = [
  { module: "finger_tapping", label: "Finger tapping (video)" },
  { module: "hand_tremor", label: "Hand tremor (video)" },
  { module: "writing_posture", label: "Writing posture / focal hand dystonia (video)" },
  { module: "eczema_photo", label: "Skin photo" },
] as const;

const CADENCES: { id: Cadence; label: string }[] = [
  { id: "twice_daily", label: "Twice daily" },
  { id: "daily", label: "Daily" },
  { id: "twice_weekly", label: "Twice weekly" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every two weeks" },
];

const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

export function StudyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<Condition>("parkinsons");
  const [consentTitle, setConsentTitle] = useState(DEFAULT_CONSENT.title);
  const [consentBody, setConsentBody] = useState(DEFAULT_CONSENT.body);
  const [evals, setEvals] = useState<{ module: string; cadence: Cadence }[]>([{ module: "finger_tapping", cadence: "weekly" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const taskModules = useMemo(() => new Set(evals.map((e) => e.module)), [evals]);

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_minmax(280px,360px)]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createStudy({ name, condition, consentTitle, consentBody, evals, reminders: [] });
          if (!r.ok) return setError(r.error);
          router.push(`/researcher/studies/${r.id}?tab=participants`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader title="Study" description="Created as active so you can enroll someone immediately." />
          <CardBody className="space-y-4">
            <label className="block text-sm font-medium text-slate-900">
              Name
              <input className={cn(input, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} placeholder="PD-FOLLOW: post-visit motor checks" required />
            </label>
            <label className="block text-sm font-medium text-slate-900">
              Condition
              <select className={cn(input, "mt-1")} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                <option value="parkinsons">Parkinson&apos;s disease</option>
                <option value="focal_hand_dystonia">Focal hand dystonia</option>
                <option value="eczema">Atopic dermatitis</option>
                <option value="other">Other</option>
              </select>
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consent form" description="Shown on the join link during enrollment." />
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
            description="Choose which CV tests participants complete and how often."
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
          <CardHeader title="Next" description="After creating the study, invite participants and assign tests from their profile." />
          <CardBody className="text-sm text-slate-600">Participants complete check-ins in the web portal. Each assigned test uses its CV module for guidance and measurement.</CardBody>
        </Card>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create study"}
        </Button>
      </div>
    </form>
  );
}
