"use client";

/**
 * Callers: apps/web/app/researcher/models/page.tsx (DroidJobs), workflow builder (DroidGenerate).
 * API: GET/POST /api/droid/jobs. Schema: DroidJob list (jobs[], optional error).
 * User: "are the droid jobs constantly \"Loading…\" ? what is up with that"
 */

import type { TaskConfig } from "@vf/shared";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

  if (measurement.name !== "index_straight_fraction") {
    return <p className="mt-1 text-xs text-amber-700">This measurement needs task-specific landmark tracks before Droid generation can be evaluated.</p>;
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
        . The candidate and its software-check results are saved to the job record for review.
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
  succeeded: ["candidate ready", "green"],
  failed: ["failed", "red"],
};

type JobsPayload = { jobs: Job[]; error?: string };

async function fetchJobs(signal?: AbortSignal): Promise<JobsPayload> {
  const res = await fetch("/api/droid/jobs", { cache: "no-store", signal });
  const body = (await res.json().catch(() => null)) as { jobs?: Job[]; error?: string } | null;
  if (!res.ok) {
    return { jobs: [], error: body?.error ?? `Could not load Droid jobs (${res.status}).` };
  }
  if (!body || !Array.isArray(body.jobs)) {
    return { jobs: [], error: body?.error ?? "Droid jobs response was malformed." };
  }
  return { jobs: body.jobs, error: body.error };
}

/** Droid+Daytona candidate jobs stored in droid_jobs. */
export type DroidJobsRow = Job;

export function DroidJobs({ initialJobs }: { initialJobs?: DroidJobsRow[] }) {
  const [data, setData] = useState<JobsPayload | null>(initialJobs ? { jobs: initialJobs } : null);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const timedOut = window.setTimeout(() => ac.abort(), 12_000);
    setRefreshing(true);
    try {
      const next = await fetchJobs(ac.signal);
      if (!ac.signal.aborted) setData(next);
    } catch {
      // Keep prior rows on transient failures; only error if we have nothing.
      setData((prev) => prev ?? { jobs: [], error: "Could not load Droid jobs." });
    } finally {
      window.clearTimeout(timedOut);
      if (!ac.signal.aborted) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 8_000);
    return () => {
      window.clearInterval(t);
      abortRef.current?.abort();
    };
  }, [load]);

  return (
    <Card>
      <CardHeader
        title="Droid jobs"
        description={
          refreshing && data
            ? "Factory Droid drafts candidate analyzers. Refreshing…"
            : "Factory Droid drafts candidate analyzers. Daytona checks the shared writing feature on landmark tracks; candidates remain in job records for review."
        }
      />
      {!data ? (
        <CardBody className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardBody>
      ) : data.jobs.length ? (
        <Table>
          <THead>
            <Th>Request</Th>
            <Th>Status</Th>
            <Th>Candidate</Th>
            <Th className="text-right">Requested</Th>
          </THead>
          <tbody>
            {data.jobs.map((j) => {
              const [label, tone] = JOB_BADGE[j.status] ?? ["unknown", "slate"];
              const title = j.request?.measurement?.label ?? j.request?.measurements?.[0]?.label ?? j.module;
              const step = j.progress?.step;
              return (
                <Tr key={j.id}>
                  <Td>
                    <Link href="/researcher/generate" className="inline-flex items-center gap-1 font-medium text-slate-900 hover:underline">
                      {title} <ExternalLink className="h-3 w-3 text-slate-400" />
                    </Link>
                    <span className="text-slate-400"> · {j.request?.condition ?? "—"}</span>
                    <div className="font-mono text-xs text-slate-400">{j.id}</div>
                  </Td>
                  <Td>
                    <Badge tone={tone}>{step && j.status === "running" ? step.replace(/_/g, " ") : label}</Badge>
                    {j.error && <div className="mt-1 max-w-xs truncate text-xs text-rose-600">{j.error}</div>}
                  </Td>
                  <Td>
                    {j.progress?.module_id ? (
                      <span className="font-mono text-xs text-brand-700">{j.progress.module_id}</span>
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
