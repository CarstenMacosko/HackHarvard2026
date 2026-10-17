import { NextResponse } from "next/server";
import { ReportValue } from "@vf/shared";
import { z } from "zod";
import { backend } from "@/lib/backend";
import { AnalysisResult, analyzeOnServer, cvServiceUrl } from "@/lib/cv-service";
import { ingest } from "@/lib/ingest";
import { MEDIA_PREFIX_STORAGE, saveMedia, signedUrlForStoragePath } from "@/lib/media";
import { validateReport } from "@/lib/report";
import { currentParticipantId } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INLINE_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/**
 * Participant upload from the web portal. The browser has already run the on-device CV module
 * (instant feedback); when CV_SERVICE_URL is configured the server re-runs the reference module
 * on the stored media and that result is authoritative.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const db = backend();
  const [participant] = await db.participants({ id: await currentParticipantId() });
  if (!participant) return NextResponse.json({ error: "Not enrolled. Join with your invite code first." }, { status: 401 });
  if (participant.status !== "active") return NextResponse.json({ error: `Your participation is ${participant.status}.` }, { status: 403 });
  const study = (await db.studies()).find((s) => s.id === participant.study_id);
  const task = study?.protocol.tasks.find((t) => t.id === form.get("task_id"));
  if (!study || !task) return NextResponse.json({ error: "Unknown check-in task." }, { status: 400 });

  let report: Record<string, z.infer<typeof ReportValue>>;
  try {
    report = z.record(ReportValue).parse(JSON.parse(String(form.get("report") ?? "{}")));
  } catch {
    return NextResponse.json({ error: "Malformed answers." }, { status: 400 });
  }

  const file = form.get("file");
  const mediaPath = form.get("media_path");
  const isPoster = form.get("media_kind") === "poster"; // video kept on-device; only a still frame uploaded
  // the browser's quality gate already said "unusable" and the participant was told why: record that verdict as-is
  const failedAttempt = form.get("intent") === "failed_attempt";
  // live capture: seconds of framing kept before the task began (analysis and playback start there)
  const trimRaw = Number(form.get("trim_start_s") ?? 0);
  const trimStartS = Number.isFinite(trimRaw) && trimRaw > 0 ? Math.min(trimRaw, 30) : 0;
  let mediaUrl: string | null = null;
  let bytes: Uint8Array | null = null;
  let contentType = "";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_INLINE_BYTES) return NextResponse.json({ error: "File too large." }, { status: 413 });
    contentType = (file.type || "application/octet-stream").split(";")[0].trim(); // MediaRecorder adds ";codecs=…"
    if (!/^(image|video)\//.test(contentType)) return NextResponse.json({ error: "Please upload a photo or a video." }, { status: 415 });
    bytes = new Uint8Array(await file.arrayBuffer());
    mediaUrl = await saveMedia(bytes, contentType, EXT[contentType] ?? (contentType.split("/")[1] || "bin"));
  } else if (typeof mediaPath === "string" && /^uploads\/[\w\-./]+$/.test(mediaPath) && !mediaPath.includes("..")) {
    mediaUrl = MEDIA_PREFIX_STORAGE + mediaPath;
  } else {
    return NextResponse.json({ error: "No photo or video received." }, { status: 400 });
  }

  // analysis: reference module on the server when available, otherwise the on-device result
  let analysis: AnalysisResult | null = null;
  let runtime: "server" | "on-device" = "on-device";
  let serverError: string | null = null;
  if (cvServiceUrl() && !isPoster && !failedAttempt) {
    try {
      analysis = await analyzeOnServer(
        {
          module: task.module,
          study_id: study.id,
          participant_id: participant.id,
          submission_id: "pending",
          task_label: task.label,
          quality_criteria: task.quality_criteria,
          ...(trimStartS ? { trim_start_s: trimStartS } : {}),
        },
        bytes ? { bytes, filename: `upload.${EXT[contentType] ?? "bin"}`, contentType } : { url: await signedUrlForStoragePath(String(mediaPath)) },
      );
      runtime = "server";
    } catch (e) {
      serverError = e instanceof Error ? e.message : String(e);
      console.error("server analysis failed, falling back to on-device result:", serverError);
    }
  }
  if (!analysis) {
    const parsed = AnalysisResult.safeParse(JSON.parse(String(form.get("analysis") ?? "null")));
    if (!parsed.success) {
      return NextResponse.json({ error: serverError ? `Analysis failed: ${serverError}` : "Missing on-device analysis." }, { status: 422 });
    }
    analysis = parsed.data;
  }
  if (failedAttempt && analysis.quality.accepted) {
    return NextResponse.json({ error: "A failed attempt must carry a failing quality report." }, { status: 400 });
  }

  if (analysis.quality.accepted) {
    const problem = validateReport(task.report_questions, report);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    const result = await ingest({
      participant,
      study,
      task,
      analysis,
      runtime,
      source: "web",
      mediaUrl,
      patientReport: report,
      context: {
        media_kind: isPoster ? "poster" : "original",
        device: String(form.get("device") ?? "").slice(0, 80) || "web",
        ...(trimStartS ? { trim_start_s: Math.round(trimStartS * 100) / 100 } : {}),
      },
    });
    return NextResponse.json({
      accepted: result.submission.accepted,
      message: result.message,
      checks: result.submission.quality.checks,
      measurements: result.observation?.measurements ?? [],
      reward_events: result.reward_events,
      streak: result.streak,
      points_balance: result.points_balance,
      attempt: result.submission.attempt,
      escalated: result.submission.escalated,
      observation_id: result.observation?.id ?? null,
      runtime,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the submission." }, { status: 400 });
  }
}
