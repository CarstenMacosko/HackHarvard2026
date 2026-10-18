"use client";

import { landmarksToPixels } from "@vf/cv";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { loadHandLandmarker } from "@/lib/cv-client/mediapipe";

export type ReplayOverlayMode = "raw" | "landmarks" | "landmarks_graphs";

const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_DIP = 7;
/** Landmark sample stride — 100 ms is enough for overlay + PIP graph without long seek loops. */
const SAMPLE_EVERY_MS = 100;

type FrameSample = {
  t: number;
  pts: number[][] | null;
  pipAngle: number | null;
};

function pipAngleDeg(pts: number[][] | null): number | null {
  if (!pts || pts.length < 8) return null;
  const a = pts[INDEX_MCP];
  const b = pts[INDEX_PIP];
  const c = pts[INDEX_DIP];
  const ux = a[0] - b[0];
  const uy = a[1] - b[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (den < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

function nearestSample(samples: FrameSample[], t: number): FrameSample | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  if (i <= 0) return samples[0];
  const prev = samples[i - 1];
  const cur = samples[i];
  return Math.abs(prev.t - t) <= Math.abs(cur.t - t) ? prev : cur;
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pts: number[][] | null,
  connections: Array<{ start: number; end: number }>,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  if (!pts) return;
  ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  for (const c of connections) {
    const a = pts[c.start];
    const b = pts[c.end];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const MODES: { id: ReplayOverlayMode; label: string }[] = [
  { id: "raw", label: "Raw video" },
  { id: "landmarks", label: "Hand landmarks" },
  { id: "landmarks_graphs", label: "Landmarks + graphs" },
];

/** Researcher video replay: raw / landmarks / landmarks + time-synced PIP-angle graph. */
export function VideoReplay({
  src,
  trimStartS = 0,
  className,
}: {
  src: string;
  trimStartS?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ReplayOverlayMode>("raw");
  const [samples, setSamples] = useState<FrameSample[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const connectionsRef = useRef<Array<{ start: number; end: number }>>([]);

  // Extract landmark track once when an overlay mode is selected (browser MediaPipe — fastest path).
  useEffect(() => {
    if (mode === "raw" || samples) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const HL = await import("@mediapipe/tasks-vision");
        connectionsRef.current = [...HL.HandLandmarker.HAND_CONNECTIONS];
        const landmarker = await loadHandLandmarker();
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = src;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("Could not load video for landmark overlay."));
        });
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("Video has no duration.");
        const W = video.videoWidth;
        const H = video.videoHeight;
        const out: FrameSample[] = [];
        let lastTs = 0;
        for (let time = 0; time < duration; time += SAMPLE_EVERY_MS / 1000) {
          if (cancelled) return;
          video.currentTime = time;
          await new Promise<void>((resolve) => {
            const onSeek = () => {
              video.removeEventListener("seeked", onSeek);
              resolve();
            };
            video.addEventListener("seeked", onSeek);
          });
          const ts = Math.max(lastTs + 1, Math.round(time * 1000));
          lastTs = ts;
          const res = (landmarker as HandLandmarker).detectForVideo(video, ts);
          const pts = res.landmarks.length ? landmarksToPixels(res.landmarks[0], W, H) : null;
          out.push({ t: time, pts, pipAngle: pipAngleDeg(pts) });
        }
        if (!cancelled) setSamples(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Landmark overlay failed.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, samples, src]);

  // Draw overlay + graph synced to playback.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = video.currentTime;
      setT(now);
      if (mode === "raw") return;
      const canvas = canvasRef.current;
      const sample = nearestSample(samples ?? [], now);
      if (canvas && video.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) drawSkeleton(ctx, sample?.pts ?? null, connectionsRef.current, canvas.width, canvas.height);
      }
      if (mode === "landmarks_graphs" && graphRef.current && samples?.length) {
        drawGraph(graphRef.current, samples, now);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, samples]);

  const startAt = typeof trimStartS === "number" && trimStartS > 0 ? `${src}#t=${trimStartS}` : src;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition",
              mode === m.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-900">
        <video ref={videoRef} src={startAt} controls playsInline className="h-full w-full object-contain" />
        {mode !== "raw" && <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Computing landmarks…
          </div>
        )}
        {error && <div className="absolute bottom-2 left-2 right-2 rounded bg-rose-600/90 px-2 py-1 text-xs text-white">{error}</div>}
      </div>
      {mode === "landmarks_graphs" && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Index PIP angle (°)</span>
            <span className="tabular">
              t = {t.toFixed(2)} s
              {nearestSample(samples ?? [], t)?.pipAngle != null && <> · {nearestSample(samples ?? [], t)!.pipAngle!.toFixed(1)}°</>}
            </span>
          </div>
          <canvas ref={graphRef} width={640} height={120} className="h-28 w-full" />
        </div>
      )}
    </div>
  );
}

function drawGraph(canvas: HTMLCanvasElement, samples: FrameSample[], playhead: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);
  const angles = samples.map((s) => s.pipAngle).filter((a): a is number => a != null);
  if (!angles.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px sans-serif";
    ctx.fillText("No index landmarks in this clip", 12, h / 2);
    return;
  }
  const minA = Math.min(...angles, 90);
  const maxA = Math.max(...angles, 180);
  const maxT = samples[samples.length - 1]?.t || 1;
  const xOf = (t: number) => (t / maxT) * (w - 16) + 8;
  const yOf = (a: number) => h - 12 - ((a - minA) / (maxA - minA || 1)) * (h - 24);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  for (const guide of [160, 180]) {
    if (guide < minA || guide > maxA) continue;
    const y = yOf(guide);
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#2a78d6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (const s of samples) {
    if (s.pipAngle == null) {
      started = false;
      continue;
    }
    const x = xOf(s.t);
    const y = yOf(s.pipAngle);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const px = xOf(Math.min(Math.max(playhead, 0), maxT));
  ctx.strokeStyle = "#eb6834";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, 4);
  ctx.lineTo(px, h - 4);
  ctx.stroke();
}
