import "server-only";
import { Measurement, QualityReport } from "@vf/shared";
import { z } from "zod";

/** Output of a CV module run, whether it ran in the browser (@vf/cv) or in services/cv. */
export const AnalysisResult = z.object({
  quality: QualityReport,
  measurements: z.array(Measurement),
  features: z.record(z.number()).default({}),
  model_version: z.string(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

export function cvServiceUrl(): string | null {
  const url = process.env.CV_SERVICE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

interface AnalyzeRequest {
  module: string;
  study_id: string;
  participant_id: string;
  submission_id: string;
  task_label: string;
  quality_criteria: Record<string, number>;
  /** video modules: skip this many seconds (live-capture framing before the task began) */
  trim_start_s?: number;
}

/** Run the reference Python module on uploaded bytes or on a fetchable URL. */
export async function analyzeOnServer(
  req: AnalyzeRequest,
  media: { bytes: Uint8Array; filename: string; contentType: string } | { url: string },
): Promise<AnalysisResult> {
  const base = cvServiceUrl();
  if (!base) throw new Error("CV_SERVICE_URL is not set");
  let res: Response;
  if ("url" in media) {
    res = await fetch(`${base}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, media_url: media.url }),
      signal: AbortSignal.timeout(120_000),
    });
  } else {
    const form = new FormData();
    form.set("file", new Blob([media.bytes as BlobPart], { type: media.contentType }), media.filename);
    form.set("request", JSON.stringify(req));
    res = await fetch(`${base}/analyze/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  }
  if (!res.ok) throw new Error(`CV service ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return AnalysisResult.parse(await res.json());
}

export interface CvHealth {
  configured: boolean;
  ok: boolean;
  url: string | null;
  modules: { id: string; version: string }[];
  error: string | null;
}

export async function cvHealth(): Promise<CvHealth> {
  const url = cvServiceUrl();
  if (!url) return { configured: false, ok: false, url: null, modules: [], error: null };
  try {
    const res = await fetch(`${url}/modules`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const modules = ((await res.json()) as { id: string; version: string }[]).map(({ id, version }) => ({ id, version }));
    return { configured: true, ok: true, url, modules, error: null };
  } catch (e) {
    return { configured: true, ok: false, url, modules: [], error: e instanceof Error ? e.message : String(e) };
  }
}
