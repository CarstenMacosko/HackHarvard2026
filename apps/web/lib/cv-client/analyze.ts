"use client";

import {
  analyzeSkinPhoto,
  analyzeTapping,
  analyzeTremor,
  analyzeWritingPosture,
  embeddingFeatures,
  HAND_CROP_MARGIN,
  HAND_CROP_SIDE,
  landmarksToPixels,
  sampleIndices,
  tappingFromTrack,
  toGray,
  type GrayImage,
  type ModuleResult,
  type PreparedHandTrack,
} from "@vf/cv";
import { allocVideoTimestamps, loadHandLandmarker, loadImageEmbedder } from "./mediapipe";

/** Video modules that run on-device from the same hand track (gen_* uses writing-posture metrics). */
export type VideoModuleId = "finger_tapping" | "hand_tremor" | "writing_posture" | (string & {});

/** True when the browser can fully measure this module (not quality-only). */
export function isOnDeviceVideoModule(module: string): boolean {
  // Every approved gen_* module uses the on-device hand-landmark pipeline; custom
  // measurement names are mapped from writing-posture features at check-in time.
  return (
    module === "finger_tapping" ||
    module === "hand_tremor" ||
    module === "writing_posture" ||
    module.startsWith("gen_")
  );
}

function analyzeHandTrack(module: string, track: PreparedHandTrack, criteria: Record<string, number>): ModuleResult {
  if (module === "hand_tremor") return analyzeTremor(track, criteria);
  if (module === "finger_tapping") return analyzeTapping(tappingFromTrack(track), criteria);
  if (module === "writing_posture" || module.startsWith("gen_")) return analyzeWritingPosture(track, criteria, module);
  throw new Error(`Unsupported on-device video module: ${module}`);
}

/**
 * On-device analysis: runs the same CV modules as services/cv (ported in @vf/cv) in the
 * participant's browser, so feedback is instant and works without the CV service.
 */

export const ANALYSIS_MAX_SIDE = 1024; // matches services/cv load_photo()
const UPLOAD_MAX_SIDE = 1600;
const VIDEO_SAMPLE_FPS = 30;
const VIDEO_MAX_SECONDS = 30;

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
  let result = analyzeSkinPhoto(actx.getImageData(0, 0, a.w, a.h), criteria);
  if (result.quality.accepted) result = { ...result, features: { ...result.features, ...(await embed(actx.canvas)) } };

  const u = fit(bitmap.width, bitmap.height, UPLOAD_MAX_SIDE);
  const { c: uc, ctx: uctx } = canvas(u.w, u.h);
  uctx.imageSmoothingQuality = "high";
  uctx.drawImage(bitmap, 0, 0, u.w, u.h);
  bitmap.close();
  return { result, upload: await toBlob(uc), width: u.w, height: u.h };
}

/**
 * Image-embedding features of the analysed photo, for trained models that read them. Without
 * them those models simply don't apply, so a loading failure is not an error for the participant.
 */
async function embed(source: HTMLCanvasElement): Promise<Record<string, number>> {
  try {
    const embedder = await loadImageEmbedder();
    const vector = embedder.embed(source).embeddings[0]?.floatEmbedding;
    return vector ? embeddingFeatures(vector) : {};
  } catch (e) {
    console.warn("image embedding unavailable", e);
    return {};
  }
}

/**
 * The hand's landmark box (+25%) from the current video frame, drawn straight into a canvas whose
 * longest side is 256 px (services/cv quality.hand_crop), so quality is judged on the hand.
 */
export function handCrop(video: CanvasImageSource, pts: number[][], W: number, H: number): GrayImage | null {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const m = HAND_CROP_MARGIN * Math.max(x1 - x0, y1 - y0);
  const X0 = Math.max(0, Math.floor(x0 - m)), Y0 = Math.max(0, Math.floor(y0 - m));
  const X1 = Math.min(W, Math.ceil(x1 + m)), Y1 = Math.min(H, Math.ceil(y1 + m));
  const sw = X1 - X0, sh = Y1 - Y0;
  if (sw < 16 || sh < 16) return null;
  const s = HAND_CROP_SIDE / Math.max(sw, sh);
  const cw = Math.max(1, Math.round(sw * s)), ch = Math.max(1, Math.round(sh * s));
  const { ctx } = canvas(cw, ch);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, X0, Y0, sw, sh, 0, 0, cw, ch);
  return toGray(ctx.getImageData(0, 0, cw, ch));
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
  module: VideoModuleId,
  criteria: Record<string, number>,
  onProgress: (fraction: number, stage: string) => void = () => {},
  /** seconds to skip at the start (live capture: the framing before the task began) */
  startS = 0,
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
    const start = Math.min(Math.max(0, startS), Math.max(0, duration - 1));
    duration = Math.min(duration - start, VIDEO_MAX_SECONDS);
    const W = video.videoWidth, H = video.videoHeight;
    const n = Math.max(1, Math.floor(duration * VIDEO_SAMPLE_FPS));
    const grayAt = new Set(sampleIndices(n));
    const full = canvas(W, H);
    const tiny = canvas(24, 24); // duplicate-frame detection → native frame rate
    const landmarks: number[][][] = [];
    const missing = Array.from({ length: 21 }, () => [NaN, NaN]);
    const grays: GrayImage[] = [];
    const handCrops: GrayImage[] = [];
    let prev: Uint8ClampedArray | null = null;
    let duplicates = 0;

    const { startMs: tsBase } = allocVideoTimestamps(Math.ceil((n * 1000) / VIDEO_SAMPLE_FPS) + 1);
    for (let i = 0; i < n; i++) {
      // the middle of each frame interval: seeking to a frame boundary can decode the previous frame
      await seek(video, start + (i + 0.5) / VIDEO_SAMPLE_FPS);
      const res = landmarker.detectForVideo(video, tsBase + Math.round((i * 1000) / VIDEO_SAMPLE_FPS));
      landmarks.push(res.landmarks.length ? landmarksToPixels(res.landmarks[0], W, H) : missing);
      tiny.ctx.drawImage(video, 0, 0, 24, 24);
      const px = tiny.ctx.getImageData(0, 0, 24, 24).data;
      if (prev && px.every((v, k) => v === prev![k])) duplicates++;
      prev = px;
      if (grayAt.has(i)) {
        full.ctx.drawImage(video, 0, 0, W, H);
        grays.push(toGray(full.ctx.getImageData(0, 0, W, H)));
        const crop = res.landmarks.length ? handCrop(video, landmarks[i], W, H) : null;
        if (crop) handCrops.push(crop);
      }
      if (i % 5 === 0) onProgress(i / n, "Tracking your hand…");
    }
    const detected = landmarks.filter((pts) => !Number.isNaN(pts[0][0])).length;
    const nativeFps = n > 1 ? Math.round(VIDEO_SAMPLE_FPS * (1 - duplicates / (n - 1)) * 10) / 10 : VIDEO_SAMPLE_FPS;

    onProgress(1, "Checking quality…");
    const track: PreparedHandTrack = {
      fps: nativeFps,
      sample_fps: VIDEO_SAMPLE_FPS,
      duration_s: n / VIDEO_SAMPLE_FPS,
      gray_samples: grays,
      hand_crops: handCrops,
      landmarks,
      detection_rate: detected / n,
    };
    const result = analyzeHandTrack(module, track, criteria);
    await seek(video, start + Math.min(duration / 2, duration - 0.05));
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
