"use client";

import type { TaskConfig } from "@vf/shared";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Table, Td, Th, THead, Tr } from "@/components/ui";

interface DispatchResult {
  job_id: string;
  request_id: string;
  mode: string;
  daytona: boolean;
  droid: boolean;
}

/** "Generate with Droid" for one measurement of a drafted task — starts DB-backed generation. */
export function DroidGenerate({ condition, task, measurement, description }: { condition: string; task: TaskConfig; measurement: TaskConfig["measurements"][number]; description: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/droid/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        condition,
        measurement: { name: measurement.name, label: measurement.label, unit: measurement.unit },
        media_type: task.media_type,
        description,
        task: { label: task.label, module: task.module, instructions: task.instructions, quality_criteria: task.quality_criteria },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not start Droid.");
      setState("idle");
      return;
    }
    setResult(body);
    setState("done");
  }

  if (state === "done" && result) {
    return (
      <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Droid is generating <span className="font-medium">{measurement.label}</span> (job{" "}
        <span className="font-mono">{result.job_id}</span>
        ). Watch progress under{" "}
        <Link href={`/researcher/generate`} className="font-medium underline">
          Generate module
        </Link>{" "}
        or{" "}
        <Link href="/researcher/models#droid" className="font-medium underline">
          Model registry → Droid jobs
        </Link>
        . The trained module is saved to the database when ready.
      </div>
    );
  }
  return (
    <div className="mt-1">
      <Button variant="secondary" size="sm" onClick={send} disabled={state === "sending"}>
        {state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />} Generate with Droid
      </Button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

interface Job {
  id: string;
  module: string;
  request: { condition?: string; measurement?: { label?: string }; measurements?: { label?: string }[]; media_type?: string; description?: string };
  status: "requested" | "dispatched" | "running" | "succeeded" | "failed";
  error: string | null;
  created_at: string;
  progress?: {
    step?: string;
    model_id?: string | null;
    module_id?: string | null;
    mode?: string;
  } | null;
}

const JOB_BADGE: Record<Job["status"], [string, "green" | "blue" | "red" | "slate"]> = {
  requested: ["queued", "slate"],
  dispatched: ["queued", "blue"],
  running: ["running", "blue"],
  succeeded: ["ready in DB", "green"],
  failed: ["failed", "red"],
};

/** Droid+Daytona jobs stored in droid_jobs (and models in cv_models). */
export function DroidJobs() {
  const [data, setData] = useState<{ jobs: Job[]; daytona?: boolean; droid?: boolean; error?: string } | null>(null);
  const load = useCallback(() => {
    fetch("/api/droid/jobs", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ jobs: [], error: "Could not load Droid jobs." }));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card>
      <CardHeader
        title="Droid jobs"
        description="Factory Droid + Daytona generate analyzers in-process. Successful modules are written to cv_models in the database for review and approval."
        actions={
          data && (
            <div className="flex gap-1.5">
              <Badge tone={data.droid ? "green" : "slate"}>{data.droid ? "Droid live" : "Droid template"}</Badge>
              <Badge tone={data.daytona ? "blue" : "slate"}>{data.daytona ? "Daytona cloud" : "Daytona local"}</Badge>
            </div>
          )
        }
      />
      {!data ? (
        <CardBody className="text-sm text-slate-500">Loading…</CardBody>
      ) : data.jobs.length ? (
        <Table>
          <THead>
            <Th>Request</Th>
            <Th>Status</Th>
            <Th>Model</Th>
            <Th className="text-right">Requested</Th>
          </THead>
          <tbody>
            {data.jobs.map((j) => {
              const [label, tone] = JOB_BADGE[j.status] ?? ["unknown", "slate"];
              const title = j.request.measurement?.label ?? j.request.measurements?.[0]?.label ?? j.module;
              const step = j.progress?.step;
              return (
                <Tr key={j.id}>
                  <Td>
                    <Link href="/researcher/generate" className="inline-flex items-center gap-1 font-medium text-slate-900 hover:underline">
                      {title} <ExternalLink className="h-3 w-3 text-slate-400" />
                    </Link>
                    <span className="text-slate-400"> · {j.request.condition ?? "—"}</span>
                    <div className="font-mono text-xs text-slate-400">{j.id}</div>
                  </Td>
                  <Td>
                    <Badge tone={tone}>{step && j.status === "running" ? step.replace(/_/g, " ") : label}</Badge>
                    {j.error && <div className="mt-1 max-w-xs truncate text-xs text-rose-600">{j.error}</div>}
                  </Td>
                  <Td>
                    {j.progress?.model_id ? (
                      <Link href={`/researcher/models/${j.progress.model_id}`} className="font-mono text-xs text-brand-700 hover:underline">
                        {j.progress.model_id}
                      </Link>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </Td>
                  <Td className="tabular text-right text-xs text-slate-500">{new Date(j.created_at).toLocaleString()}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No Droid jobs yet">
          Open{" "}
          <Link href="/researcher/generate" className="font-medium text-brand-700 hover:underline">
            Generate module
          </Link>{" "}
          or click <span className="font-medium">Generate with Droid</span> in the workflow builder.
        </EmptyState>
      )}
      {data?.error && <CardBody className="text-xs text-rose-600">{data.error}</CardBody>}
    </Card>
  );
}
