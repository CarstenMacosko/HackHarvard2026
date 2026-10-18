"use client";

import { TappingCoach, TimedCaptureCoach, landmarksToPixels, laplacianVariance, mean, toGray, type CoachState, type GuidanceLevel } from "@vf/cv";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { AlertTriangle, CheckCircle2, Loader2, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, ProgressBar, cn } from "@/components/ui";
import { handCrop } from "@/lib/cv-client/analyze";
import { loadLiveHandLandmarker } from "@/lib/cv-client/mediapipe";

/**
 * Live camera capture with on-screen coaching. Supports finger tapping (tap-triggered test),
 * rest tremor (hold still once framed), and writing posture (hold then write once framed).
 */

const DETECT_EVERY_MS = 50;
const MEASURE_EVERY_MS = 400;
const ROTATE_AFTER_MS = 3_000;
const READY_ROTATE_AFTER_MS = 20_000;
const LOST_MS = 1_500;
const PRE_ROLL_S = 0.5;
const VIDEO_BITRATE = 1_200_000;

export type LiveCaptureModule = string;

type LiveUi = { durationMs: number; readyHint: string; recordingLabel: string; steps: [string, string, string]; restartHint: string };

const MODULE_UI: Record<string, LiveUi> = {
  finger_tapping: {
    durationMs: 10_000,
    readyHint: "Ready: start tapping your index finger and thumb",
    recordingLabel: "Recording · keep tapping",
    steps: ["Frame your hand", "Start tapping", "Keep going for 10 s"],
    restartHint: "Start tapping again when you're set.",
  },
  hand_tremor: {
    durationMs: 12_000,
    readyHint: "Hold still — recording starts automatically",
    recordingLabel: "Recording · keep your hand relaxed and still",
    steps: ["Frame your hand", "Hold still", "Keep still for 12 s"],
    restartHint: "Hold still again when you're set.",
  },
  writing_posture: {
    durationMs: 10_000,
    readyHint: "Hold the pen — recording starts, then write your phrase",
    recordingLabel: "Recording · hold, then write once",
    steps: ["Frame writing hand", "Hold pen still", "Write for ~8 s"],
    restartHint: "Frame your hand again, then write.",
  },
};

/** Writing / generated FHD modules share the pen-hold coaching UI. */
function liveUiFor(module: string): LiveUi {
  if (MODULE_UI[module]) return MODULE_UI[module];
  if (module.startsWith("gen_")) return MODULE_UI.writing_posture;
  return MODULE_UI.hand_tremor;
}

const COLORS: Record<GuidanceLevel, string> = {
  good: "#10b981",
  warn: "#f59e0b",
  bad: "#f43f5e",
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const probe = document.createElement("video");
  const candidates: [string, string][] = [
    ["video/mp4;codecs=avc1", 'video/mp4; codecs="avc1.42E01E"'],
    ["video/webm;codecs=vp9", 'video/webm; codecs="vp9"'],
    ["video/webm;codecs=vp8", 'video/webm; codecs="vp8"'],
    ["video/webm", "video/webm"],
    ["video/mp4", "video/mp4"],
  ];
  return candidates.find(([rec, play]) => MediaRecorder.isTypeSupported(rec) && probe.canPlayType(play) !== "")?.[0];
}

interface Segment {
  rec: MediaRecorder;
  chunks: Blob[];
  start: number;
}

function makeCoach(module: string, durationMs: number): TappingCoach | TimedCaptureCoach {
  return module === "finger_tapping" ? new TappingCoach(durationMs) : new TimedCaptureCoach(durationMs);
}

export function liveCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export function LiveCapture({
  module = "finger_tapping",
  onCapture,
  onCancel,
}: {
  module?: LiveCaptureModule;
  onCapture: (file: File, trimStartS: number) => void;
  onCancel: () => void;
}) {
  const ui = liveUiFor(module);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState<"starting" | "live" | "finishing" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<CoachState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = useRef(onCapture);
  done.current = onCapture;
  const tapTriggered = module === "finger_tapping";

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameHandle = 0;
    let segment: Segment | null = null;
    let finishing = false;
    let coach = makeCoach(module, ui.durationMs);
    let lastDetect = 0;
    let lastMeasure = 0;
    let lastTs = 0;
    let badSince: number | null = null;
    let brightness: number | null = null;
    let sharpness: number | null = null;
    const mime = pickMime();
    const tiny = document.createElement("canvas");
    tiny.width = 64;
    tiny.height = 48;
    const tinyCtx = tiny.getContext("2d", { willReadFrequently: true });

    const startSegment = (s: MediaStream): Segment | null => {
      if (!mime) return null;
      const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE });
      const seg: Segment = { rec, chunks: [], start: performance.now() };
      rec.ondataavailable = (e) => e.data.size && seg.chunks.push(e.data);
      rec.start(1000);
      return seg;
    };
    const rotate = (s: MediaStream) => {
      const old = segment;
      segment = startSegment(s);
      if (old && old.rec.state !== "inactive") old.rec.stop();
    };

    const finish = (st: CoachState) => {
      finishing = true;
      setStatus("finishing");
      const seg = segment;
      if (!seg || st.tapStart === null) return;
      const trim = Math.max(0, (st.tapStart - seg.start) / 1000 - PRE_ROLL_S);
      seg.rec.onstop = () => {
        const type = (mime ?? "video/webm").split(";")[0];
        const blob = new Blob(seg.chunks, { type });
        stream?.getTracks().forEach((t) => t.stop());
        if (!cancelled) done.current(new File([blob], `live-check-in.${type.endsWith("mp4") ? "mp4" : "webm"}`, { type }), Math.round(trim * 100) / 100);
      };
      setTimeout(() => seg.rec.state !== "inactive" && seg.rec.stop(), 400);
    };

    const draw = (pts: number[][] | null, level: GuidanceLevel, W: number, H: number, connections: { start: number; end: number }[]) => {
      const c = overlayRef.current;
      if (!c) return;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      const lw = Math.max(2, Math.round(Math.min(W, H) / 160));
      if (!pts) {
        const w = Math.min(W, H) * 0.6;
        ctx.setLineDash([lw * 4, lw * 3]);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = lw;
        ctx.strokeRect((W - w) / 2, (H - w) / 2, w, w);
        ctx.setLineDash([]);
        return;
      }
      ctx.strokeStyle = COLORS[level];
      ctx.lineWidth = lw;
      for (const { start, end } of connections) {
        ctx.beginPath();
        ctx.moveTo(pts[start][0], pts[start][1]);
        ctx.lineTo(pts[end][0], pts[end][1]);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      for (const [x, y] of pts) {
        ctx.beginPath();
        ctx.arc(x, y, lw * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    (async () => {
      try {
        if (!mime) throw new Error("This browser can't record video here. Upload a video instead.");
        const [landmarker, { HandLandmarker: HL }] = await Promise.all([loadLiveHandLandmarker(), import("@mediapipe/tasks-vision")]);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        segment = startSegment(stream);
        setStatus("live");
        const s = stream;
        const loop = () => {
          if (cancelled || finishing) return;
          frameHandle = requestAnimationFrame(loop);
          const now = performance.now();
          if (now - lastDetect < DETECT_EVERY_MS || video.readyState < 2) return;
          lastDetect = now;
          const W = video.videoWidth,
            H = video.videoHeight;
          if (!W || !H) return;
          const ts = Math.max(lastTs + 1, Math.round(now));
          lastTs = ts;
          const res = (landmarker as HandLandmarker).detectForVideo(video, ts);
          const pts = res.landmarks.length ? landmarksToPixels(res.landmarks[0], W, H) : null;
          let measured = false;
          if (now - lastMeasure >= MEASURE_EVERY_MS) {
            lastMeasure = now;
            measured = true;
            const crop = pts ? handCrop(video, pts, W, H) : null;
            if (crop) {
              brightness = mean(crop.data);
              sharpness = laplacianVariance(crop);
            } else if (tinyCtx) {
              tinyCtx.drawImage(video, 0, 0, 64, 48);
              brightness = mean(toGray(tinyCtx.getImageData(0, 0, 64, 48)).data);
            }
          }
          const st = coach.push({
            t: now,
            pts,
            width: W,
            height: H,
            brightness: measured ? brightness : null,
            sharpness: measured && pts ? sharpness : null,
          });
          draw(pts, st.guidance.level, W, H, HL.HAND_CONNECTIONS);

          if (st.phase === "tapping") {
            badSince = st.guidance.level === "bad" ? (badSince ?? now) : null;
            if (badSince !== null && now - badSince > LOST_MS) {
              setNotice(`Recording restarted: ${st.guidance.message.toLowerCase()}. ${ui.restartHint}`);
              coach = makeCoach(module, ui.durationMs);
              badSince = null;
              rotate(s);
              return;
            }
            setNotice(null);
            if (st.done) {
              setState(st);
              return finish(st);
            }
          } else if (segment) {
            const age = now - segment.start;
            if ((st.phase === "framing" && st.guidance.level === "bad" && age > ROTATE_AFTER_MS) || (st.phase === "ready" && age > READY_ROTATE_AFTER_MS)) rotate(s);
          }
          setState(st);
        };
        frameHandle = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in your browser settings, or upload a video instead."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found. Upload a video instead."
              : e instanceof Error
                ? e.message
                : "The camera couldn't start.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameHandle);
      if (segment && segment.rec.state !== "inactive" && !finishing) segment.rec.stop();
      if (!finishing) stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, module, ui.durationMs, ui.restartHint]);

  const g = state?.guidance;
  const phase = state?.phase ?? "framing";
  const secondsLeft = state ? Math.max(0, Math.ceil((ui.durationMs - state.elapsed) / 1000)) : Math.ceil(ui.durationMs / 1000);
  const mirror = facing === "user";
  const step = status === "finishing" ? 3 : phase === "tapping" ? 2 : phase === "ready" ? 1 : 0;
  const recording = phase === "tapping";

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-md bg-slate-900">
        <video ref={videoRef} playsInline muted className={cn("aspect-[4/3] w-full object-contain", mirror && "-scale-x-100")} />
        <canvas ref={overlayRef} className={cn("pointer-events-none absolute inset-0 h-full w-full object-contain", mirror && "-scale-x-100")} />

        {status === "live" && g && (
          <div
            role="status"
            aria-live="polite"
            data-guidance={g.code}
            className={cn(
              "absolute inset-x-3 top-3 flex items-center gap-2 rounded-lg px-4 py-3 text-base font-semibold shadow-lg sm:text-lg",
              g.level === "good" ? "bg-emerald-600/90 text-white" : g.level === "warn" ? "bg-amber-400/95 text-amber-950" : "bg-rose-600/90 text-white",
            )}
          >
            {g.level === "good" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
            {phase === "ready" && g.level !== "bad" ? ui.readyHint : g.message}
          </div>
        )}

        {status === "live" && recording && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg bg-slate-900/80 px-4 py-3 text-white">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" /> {ui.recordingLabel}
              </span>
              <span className="tabular" data-testid="seconds-left">
                {secondsLeft} s
              </span>
            </div>
            <ProgressBar value={Math.min(1, (state?.elapsed ?? 0) / ui.durationMs)} className="mt-2" tone="white" />
          </div>
        )}

        {(status === "starting" || status === "finishing") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/60 text-sm text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            {status === "starting" ? "Starting the camera…" : "Done. Checking your video…"}
          </div>
        )}
        {status === "error" && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{error}</div>}
      </div>

      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}

      <ol className="grid grid-cols-3 gap-2 text-xs">
        {ui.steps.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-md px-2.5 py-2 ring-1 ring-inset",
              i < step
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : i === step
                  ? "bg-brand-50 font-medium text-brand-800 ring-brand-200"
                  : "text-slate-500 ring-slate-200",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setFacing(facing === "user" ? "environment" : "user")} disabled={status === "finishing" || recording}>
          <SwitchCamera className="h-3.5 w-3.5" /> Switch camera
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={status === "finishing"}>
          <X className="h-3.5 w-3.5" /> Upload a video instead
        </Button>
        <span className="ml-auto text-xs text-slate-500">
          {tapTriggered ? "Recording keeps the part after tapping starts." : "Recording starts once your hand is framed."}
        </span>
      </div>
    </div>
  );
}
