"use client";

import type { TaskConfig } from "@vf/shared";
import { Bot, Check, Copy, ExternalLink, GitPullRequest, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Table, Td, Th, THead, Tr } from "@/components/ui";

interface DispatchResult {
  request_id: string;
  dispatched: boolean;
  ref: string | null;
  command: string;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Copied" : "Copy"}
    </Button>
  );
}

/** "Generate with Droid" for one measurement of a drafted task. */
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
    return result.dispatched ? (
      <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Droid is building <span className="font-medium">{measurement.label}</span> (request <span className="font-mono">{result.request_id}</span>, branch {result.ref}). It opens a draft pull
        request for review when it finishes; follow it under{" "}
        <Link href="/researcher/models#droid" className="font-medium underline">
          Model registry → Droid jobs
        </Link>
        .
      </div>
    ) : (
      <div className="mt-2 space-y-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p>
          GitHub isn&apos;t connected to this deployment (set <span className="font-mono">GITHUB_TOKEN</span> and <span className="font-mono">GITHUB_REPOSITORY</span>), so the request was recorded
          but not sent. Start the same Droid run from a terminal:
        </p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 font-mono text-[11px] ring-1 ring-slate-200">{result.command}</pre>
        <CopyButton text={result.command} />
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

interface Run {
  id: number;
  title: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  url: string;
  request_id: string | null;
  pull_request: { number: number; url: string; state: string; draft: boolean; title: string } | null;
}
interface RequestRow {
  id: string;
  entity_id: string | null;
  created_at: string;
  detail: { condition?: string; measurement?: string; media_type?: string; dispatched?: boolean } | null;
}

function runBadge(r: Run) {
  if (r.status !== "completed") return <Badge tone="blue">{r.status.replace("_", " ")}</Badge>;
  if (r.conclusion === "success") return <Badge tone="green">finished</Badge>;
  return <Badge tone="red">{r.conclusion ?? "failed"}</Badge>;
}

/** Droid runs and the pull requests they opened (model registry). */
export function DroidJobs() {
  const [data, setData] = useState<{ configured: boolean; runs: Run[]; requests: RequestRow[]; error?: string } | null>(null);
  const load = useCallback(() => {
    fetch("/api/droid/jobs", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ configured: false, runs: [], requests: [], error: "Could not load Droid jobs." }));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card>
      <CardHeader
        title="Droid jobs"
        description="Factory Droid builds a study model with the training kit in GitHub Actions, then opens a draft pull request with the spec, the trained model and its model card."
        actions={data && <Badge tone={data.configured ? "green" : "slate"}>{data.configured ? "GitHub connected" : "GitHub not connected"}</Badge>}
      />
      {!data ? (
        <CardBody className="text-sm text-slate-500">Loading…</CardBody>
      ) : data.configured && data.runs.length ? (
        <Table>
          <THead>
            <Th>Request</Th>
            <Th>Status</Th>
            <Th>Pull request</Th>
            <Th className="text-right">Started</Th>
          </THead>
          <tbody>
            {data.runs.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-slate-900 hover:underline">
                    {r.title.replace(/^Droid model: /, "").replace(/\s*\[[^\]]+\]$/, "")} <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                  {r.request_id && <div className="font-mono text-xs text-slate-400">{r.request_id}</div>}
                </Td>
                <Td>{runBadge(r)}</Td>
                <Td>
                  {r.pull_request ? (
                    <a href={r.pull_request.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                      <GitPullRequest className="h-3.5 w-3.5" /> #{r.pull_request.number} {r.pull_request.draft ? "(draft)" : r.pull_request.state}
                    </a>
                  ) : (
                    <span className="text-slate-400">–</span>
                  )}
                </Td>
                <Td className="tabular text-right text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : data.requests.length ? (
        <Table>
          <THead>
            <Th>Request</Th>
            <Th>Measurement</Th>
            <Th>Sent to GitHub</Th>
            <Th className="text-right">Requested</Th>
          </THead>
          <tbody>
            {data.requests.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs">{r.entity_id}</Td>
                <Td>
                  {r.detail?.measurement} <span className="text-slate-400">· {r.detail?.condition}</span>
                </Td>
                <Td>{r.detail?.dispatched ? <Badge tone="green">yes</Badge> : <Badge>no: run the gh command</Badge>}</Td>
                <Td className="tabular text-right text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No Droid jobs yet">
          In the workflow builder, draft a protocol and click <span className="font-medium">Generate with Droid</span> next to a measurement that needs a model.
        </EmptyState>
      )}
      {data?.error && <CardBody className="text-xs text-rose-600">{data.error}</CardBody>}
    </Card>
  );
}
