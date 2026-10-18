"use client";

import { landmarksToPixels } from "@vf/cv";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { loadImageHandLandmarker } from "@/lib/cv-client/mediapipe";
import {
  formatTrackerValue,
  resolveReplayTracker,
  sampleTracker,
  type ReplayMeasurement,
  type ResolvedTracker,
} from "@/lib/cv-client/replay-trackers";

export type ReplayOverlayMode = "raw" | "landmarks" | "landmarks_graphs";
export type { ReplayMeasurement };

/** Landmark sample stride — 100 ms is enough for overlay + graphs without long seek loops. */
const SAMPLE_EVERY_MS = 100;

type FrameSample = {
  t: number;
  pts: number[][] | null;
  value: number | null;
};

/** @deprecated Prefer resolveReplayTracker — kept for call sites that imported the old helper. */
export function graphSpecForMeasurements(measurements: ReplayMeasurement[], module = "") {
  return resolveReplayTracker(measurements, module);
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

/** Researcher video replay: raw / landmarks / landmarks + measurement-specific graph. */
export function VideoReplay({
  src,
  trimStartS = 0,
  measurements = [],
  module = "",
  className,
}: {
  src: string;
  trimStartS?: number;
  /** Observation measurements — drives which graph (if any) is shown. */
  measurements?: ReplayMeasurement[];
  module?: string;
  className?: string;
}) {
  const tracker = useMemo(() => resolveReplayTracker(measurements, module), [measurements, module]);
  const modes = useMemo(() => {
    const base: { id: ReplayOverlayMode; label: string }[] = [
      { id: "raw", label: "Raw video" },
      { id: "landmarks", label: "Hand landmarks" },
    ];
    if (tracker) base.push({ id: "landmarks_graphs", label: "Landmarks + graphs" });
    return base;
  }, [tracker]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ReplayOverlayMode>("raw");
  const [samples, setSamples] = useState<FrameSample[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const connectionsRef = useRef<Array<{ start: number; end: number }>>([]);

  useEffect(() => {
    if (mode === "landmarks_graphs" && !tracker) setMode("landmarks");
  }, [mode, tracker]);

  useEffect(() => {
    setSamples(null);
    setError(null);
  }, [src, tracker?.id]);

  useEffect(() => {
    if (mode === "raw" || samples || !tracker) return;
    let cancelled = false;
    let revoke: (() => void) | undefined;
    const active = tracker;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const HL = await import("@mediapipe/tasks-vision");
        connectionsRef.current = [...HL.HandLandmarker.HAND_CONNECTIONS];
        const landmarker = await loadImageHandLandmarker();
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        const objectUrl = await blobUrlForMedia(src);
        revoke = objectUrl.revoke;
        video.src = objectUrl.url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("Could not load video for landmark overlay."));
        });
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("Video has no duration.");
        const W = video.videoWidth;
        const H = video.videoHeight;
        const out: FrameSample[] = [];
        let prevPalm: number[] | null = null;
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
          const res = (landmarker as HandLandmarker).detect(video);
          const pts = res.landmarks.length ? landmarksToPixels(res.landmarks[0], W, H) : null;
          const { value, palm } = sampleTracker(active, pts, prevPalm);
          prevPalm = palm;
          out.push({ t: time, pts, value });
        }
        if (!cancelled) setSamples(out);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Landmark overlay failed.";
          setError(
            msg.includes("cross-origin") || msg.includes("texImage2D")
              ? "Could not read this video for landmarks (CORS). Try re-uploading the capture."
              : msg.includes("timestamp")
                ? "Landmark tracker hit a timestamp glitch — refresh the page and open landmarks again."
                : msg,
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [mode, samples, src, tracker]);

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
      if (mode === "landmarks_graphs" && graphRef.current && samples?.length && tracker) {
        drawGraph(graphRef.current, samples, now, tracker);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, samples, tracker]);

  const startAt = typeof trimStartS === "number" && trimStartS > 0 ? `${src}#t=${trimStartS}` : src;
  const live = nearestSample(samples ?? [], t);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition",
              mode === m.id ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-600 dark:hover:bg-slate-800",
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
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing landmarks…
          </div>
        )}
        {error && <div className="absolute bottom-2 left-2 right-2 rounded bg-rose-600/90 px-2 py-1 text-xs text-white">{error}</div>}
      </div>
      {mode === "landmarks_graphs" && tracker && (
        <div className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {tracker.label}
              {tracker.unit ? ` (${tracker.unit})` : ""}
            </span>
            <span className="tabular">
              t = {t.toFixed(2)} s
              {live?.value != null && <> · {formatTrackerValue(tracker, live.value)}</>}
            </span>
          </div>
          <canvas ref={graphRef} width={720} height={160} className="h-40 w-full" />
        </div>
      )}
    </div>
  );
}

async function blobUrlForMedia(src: string): Promise<{ url: string; revoke: () => void }> {
  const res = await fetch(src, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch video (${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

function niceTicks(min: number, max: number, targetCount: number): number[] {
  const span = Math.max(max - min, 1e-6);
  const raw = span / Math.max(targetCount, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  const step = (err >= 5 ? 5 : err >= 2 ? 2 : 1) * pow;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (!ticks.length) ticks.push(min, max);
  return ticks;
}

function drawGraph(canvas: HTMLCanvasElement, samples: FrameSample[], playhead: number, tracker: ResolvedTracker) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const pad = { left: 48, right: 12, top: 12, bottom: 28 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);

  const values = samples.map((s) => s.value).filter((a): a is number => a != null);
  if (!values.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("No hand landmarks in this clip", pad.left, h / 2);
    return;
  }

  let minV = Math.min(...values);
  let maxV = Math.max(...values);
  if (tracker.axis === "angle") {
    minV = Math.min(minV, tracker.guide != null ? tracker.guide - 20 : minV, 60);
    maxV = Math.max(maxV, tracker.guide != null ? tracker.guide + 20 : maxV, 180);
  } else if (tracker.axis === "fraction") {
    minV = 0;
    maxV = 1;
  } else {
    const padY = Math.max((maxV - minV) * 0.1, 0.01);
    minV = Math.max(0, minV - padY);
    maxV = maxV + padY;
  }
  const maxT = Math.max(samples[samples.length - 1]?.t || 1, 0.1);
  const xOf = (t: number) => pad.left + (t / maxT) * plotW;
  const yOf = (a: number) => pad.top + plotH - ((a - minV) / (maxV - minV || 1)) * plotH;

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left + 0.5, pad.top + 0.5, plotW, plotH);

  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.textBaseline = "middle";

  for (const tick of niceTicks(minV, maxV, 5)) {
    const y = yOf(tick);
    const isGuide = tracker.guide != null && Math.abs(tick - tracker.guide) < 1e-6;
    ctx.strokeStyle = isGuide ? "#94a3b8" : "#e2e8f0";
    ctx.setLineDash(isGuide ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    const label =
      tracker.axis === "angle"
        ? `${Math.round(tick)}°`
        : tracker.axis === "fraction"
          ? tick.toFixed(0)
          : tick < 1
            ? tick.toFixed(2)
            : tick.toFixed(1);
    ctx.fillText(label, pad.left - 6, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of niceTicks(0, maxT, 6)) {
    const x = xOf(tick);
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText(`${tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}s`, x, pad.top + plotH + 6);
  }

  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.fillText("time", pad.left + plotW / 2, h - 10);
  ctx.save();
  ctx.translate(12, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(tracker.unit || "value", 0, 0);
  ctx.restore();

  if (tracker.guide != null && tracker.guide >= minV && tracker.guide <= maxV) {
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    const guideLabel =
      tracker.axis === "angle" ? `guide ${tracker.guide}°` : tracker.axis === "fraction" ? "threshold" : `guide ${tracker.guide}`;
    ctx.fillText(guideLabel, pad.left + 4, yOf(tracker.guide) - 2);
  }

  ctx.strokeStyle = "#2a78d6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (const s of samples) {
    if (s.value == null) {
      started = false;
      continue;
    }
    const x = xOf(s.t);
    const y = yOf(s.value);
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
  ctx.moveTo(px, pad.top);
  ctx.lineTo(px, pad.top + plotH);
  ctx.stroke();
}
