import "server-only";
import { z } from "zod";

/**
 * Droid model generation: the web app asks GitHub Actions to run .github/workflows/droid-model.yml,
 * where Factory Droid builds a study model with the training kit and opens a draft pull request.
 *
 * Needs GITHUB_TOKEN (fine-grained: Actions read/write, Pull requests read, on this repository)
 * and GITHUB_REPOSITORY ("owner/repo"). DROID_WORKFLOW_REF picks the branch the workflow runs on
 * (default: the repository's default branch). Without them the app shows the equivalent
 * `gh workflow run` command instead. The Factory API key lives only in the GitHub secret.
 */

export const WORKFLOW_FILE = "droid-model.yml";

export const DroidRequestInput = z.object({
  condition: z.string().min(2).max(80),
  measurement: z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, "snake_case"),
    label: z.string().min(1).max(80),
    unit: z.string().min(1).max(80),
  }),
  media_type: z.enum(["photo", "video"]),
  description: z.string().max(2000).default(""),
  dataset_hint: z.string().max(300).optional(),
  study_id: z.string().max(60).optional(),
  task: z.unknown().optional(),
});
export type DroidRequestInput = z.infer<typeof DroidRequestInput>;
export type DroidRequest = DroidRequestInput & { request_id: string; requested_by: string };

export function newRequestId(measurementName: string, now = Date.now()): string {
  // matches training/scripts/droid_request.py: 4-41 lowercase letters, digits or dashes
  const base = measurementName.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "model";
  return `${base}-${now.toString(36)}`.slice(0, 41);
}

export function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo, ref: process.env.DROID_WORKFLOW_REF || null };
}

export function ghCommand(req: DroidRequest): string {
  const json = JSON.stringify(req).replace(/'/g, "'\\''");
  return `gh workflow run ${WORKFLOW_FILE} -f request='${json}'`;
}

async function gh(path: string, init: RequestInit = {}) {
  const cfg = githubConfig();
  if (!cfg) throw new Error("GitHub is not configured");
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${cfg.token}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function dispatch(req: DroidRequest): Promise<{ ref: string }> {
  const cfg = githubConfig()!;
  const ref = cfg.ref ?? ((await gh(""))?.default_branch as string);
  await gh(`/actions/workflows/${WORKFLOW_FILE}/dispatches`, { method: "POST", body: JSON.stringify({ ref, inputs: { request: JSON.stringify(req) } }) });
  return { ref };
}

export interface DroidRun {
  id: number;
  title: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | ...
  created_at: string;
  url: string;
  request_id: string | null;
  pull_request: { number: number; url: string; state: string; draft: boolean; title: string } | null;
}

const RunSchema = z.object({
  id: z.number(),
  display_title: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  created_at: z.string(),
  html_url: z.string(),
});
const PullSchema = z.object({ number: z.number(), html_url: z.string(), state: z.string(), draft: z.boolean().optional(), title: z.string(), head: z.object({ ref: z.string() }) });

/** Recent Droid runs, each matched to the pull request it opened (branch droid/model-<request_id>). */
export async function recentRuns(limit = 10): Promise<DroidRun[]> {
  const [runs, pulls] = await Promise.all([
    gh(`/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${limit}`),
    gh(`/pulls?state=all&per_page=50&sort=created&direction=desc`),
  ]);
  const prs = z.array(PullSchema).parse(pulls).filter((p) => p.head.ref.startsWith("droid/model-"));
  return z
    .array(RunSchema)
    .parse(runs.workflow_runs)
    .map((r) => {
      const requestId = r.display_title.match(/\[([a-z0-9-]{4,41})\]/)?.[1] ?? null;
      const pr = requestId ? prs.find((p) => p.head.ref === `droid/model-${requestId}`) : undefined;
      return {
        id: r.id,
        title: r.display_title,
        status: r.status ?? "unknown",
        conclusion: r.conclusion,
        created_at: r.created_at,
        url: r.html_url,
        request_id: requestId,
        pull_request: pr ? { number: pr.number, url: pr.html_url, state: pr.state, draft: pr.draft ?? false, title: pr.title } : null,
      };
    });
}
