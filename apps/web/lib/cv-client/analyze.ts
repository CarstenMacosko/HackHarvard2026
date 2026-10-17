"use client";

import { analyzeSkinPhoto, analyzeTapping, handDistance, sampleIndices, toGray, type GrayImage, type ModuleResult } from "@vf/cv";
import { loadHandLandmarker } from "./mediapipe";

/**
 * On-device analysis: runs the same CV modules as services/cv (ported in @vf/cv) in the
 * participant's browser, so feedback is instant and works without the CV service.
 */

export const ANALYSIS_MAX_SIDE = 1024; // matches services/cv load_photo()
const UPLOAD_MAX_SIDE = 1600;
const VIDEO_SAMPLE_FPS = 30;
const VIDEO_MAX_SECONDS = 30;
// The landmarker is shared for the whole page, and VIDEO mode requires timestamps that keep
// increasing across calls, so each new clip continues from where the previous one stopped.
let nextTimestampMs = 0;

export interface PhotoAnalysis {
  result: ModuleResult;
  /** JPEG to upload (≤1600 px), orientation already applied */
  upload: Blob;
  width: number;
  height: number;
}

export interface VideoAnalysis {
  result: ModuleResult;
  /** still frame from the middle of the clip, for previews and demo-mode storage */
  poster: Blob;
  duration_s: number;
  native_fps: number;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  return { c, ctx };
}

function fit(w: number, h: number, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

const toBlob = (c: HTMLCanvasElement, type = "image/jpeg", quality = 0.9) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode image"))), type, quality));

export async function analyzePhotoFile(file: Blob, criteria: Record<string, number>): Promise<PhotoAnalysis> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format can't be read by your browser. Please send a JPEG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible).");
  }
  const a = fit(bitmap.width, bitmap.height, ANALYSIS_MAX_SIDE);
  const { ctx: actx } = canvas(a.w, a.h);
  actx.imageSmoothingQuality = "high";
  actx.drawImage(bitmap, 0, 0, a.w, a.h);
  const result = analyzeSkinPhoto(actx.getImageData(0, 0, a.w, a.h), criteria);

  const u = fit(bitmap.width, bitmap.height, UPLOAD_MAX_SIDE);
  const { c: uc, ctx: uctx } = canvas(u.w, u.h);
  uctx.imageSmoothingQuality = "high";
  uctx.drawImage(bitmap, 0, 0, u.w, u.h);
  bitmap.close();
  return { result, upload: await toBlob(uc), width: u.w, height: u.h };
}

function once(target: EventTarget, ok: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${ok}`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("This video can't be played by your browser. Please record in your phone's standard video format (MP4/H.264)."));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(ok, onOk);
    target.addEventListener("error", onErr);
  });
}

async function seek(video: HTMLVideoElement, t: number) {
  if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return;
  const done = once(video, "seeked");
  video.currentTime = t;
  await done;
}

export async function analyzeVideoFile(
  file: Blob,
  criteria: Record<string, number>,
  onProgress: (fraction: number, stage: string) => void = () => {},
): Promise<VideoAnalysis> {
  onProgress(0, "Loading the hand tracker…");
  const landmarker = await loadHandLandmarker();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const meta = once(video, "loadeddata");
    video.src = url;
    await meta;
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // MediaRecorder WebM files have no duration header until you seek past the end
      await seek(video, 1e7);
      duration = video.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the video length.");
    duration = Math.min(duration, VIDEO_MAX_SECONDS);
    const W = video.videoWidth, H = video.videoHeight;
    const n = Math.max(1, Math.floor(duration * VIDEO_SAMPLE_FPS));
    const grayAt = new Set(sampleIndices(n));
    const full = canvas(W, H);
    const tiny = canvas(24, 24); // duplicate-frame detection → native frame rate
    const distance: number[] = [];
    const grays: GrayImage[] = [];
    let prev: Uint8ClampedArray | null = null;
    let duplicates = 0;

    const tsBase = nextTimestampMs;
    nextTimestampMs = tsBase + Math.ceil((n * 1000) / VIDEO_SAMPLE_FPS) + 1000;
    for (let i = 0; i < n; i++) {
      await seek(video, i / VIDEO_SAMPLE_FPS);
      const res = landmarker.detectForVideo(video, tsBase + Math.round((i * 1000) / VIDEO_SAMPLE_FPS));
      distance.push(res.landmarks.length ? handDistance(res.landmarks[0], W, H) : NaN);
      tiny.ctx.drawImage(video, 0, 0, 24, 24);
      const px = tiny.ctx.getImageData(0, 0, 24, 24).data;
      if (prev && px.every((v, k) => v === prev![k])) duplicates++;
      prev = px;
      if (grayAt.has(i)) {
        full.ctx.drawImage(video, 0, 0, W, H);
        grays.push(toGray(full.ctx.getImageData(0, 0, W, H)));
      }
      if (i % 5 === 0) onProgress(i / n, "Tracking your hand…");
    }
    const detected = distance.filter((d) => !Number.isNaN(d)).length;
    const nativeFps = n > 1 ? Math.round(VIDEO_SAMPLE_FPS * (1 - duplicates / (n - 1)) * 10) / 10 : VIDEO_SAMPLE_FPS;

    onProgress(1, "Checking quality…");
    const result = analyzeTapping(
      { fps: nativeFps, sample_fps: VIDEO_SAMPLE_FPS, duration_s: n / VIDEO_SAMPLE_FPS, gray_samples: grays, distance, detection_rate: detected / n },
      criteria,
    );
    await seek(video, Math.min(duration / 2, duration - 0.05));
    const p = fit(W, H, 960);
    const poster = canvas(p.w, p.h);
    poster.ctx.drawImage(video, 0, 0, p.w, p.h);
    return { result, poster: await toBlob(poster.c), duration_s: n / VIDEO_SAMPLE_FPS, native_fps: nativeFps };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
