"use client";

import type { HandLandmarker, ImageEmbedder } from "@mediapipe/tasks-vision";

const HOSTED_HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const HOSTED_EMBEDDER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite";
let loadingHands: Promise<HandLandmarker> | null = null;
let loadingLiveHands: Promise<HandLandmarker> | null = null;
let loadingImageHands: Promise<HandLandmarker> | null = null;
let loadingEmbedder: Promise<ImageEmbedder> | null = null;
/** Shared VIDEO-mode clock — must never go backwards across check-in / replay on the same page. */
let nextVideoTimestampMs = 1;

const fileset = async () => {
  const { FilesetResolver } = await import("@mediapipe/tasks-vision");
  return FilesetResolver.forVisionTasks("/mediapipe/wasm");
};

/** Self-hosted copy first (scripts/fetch-mediapipe.mjs), Google's hosted copy as a fallback. */
async function withFallback<T>(create: (path: string) => Promise<T>, local: string, hosted: string): Promise<T> {
  try {
    return await create(local);
  } catch {
    return await create(hosted);
  }
}

async function createHandLandmarker(runningMode: "VIDEO" | "IMAGE"): Promise<HandLandmarker> {
  const { HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fs = await fileset();
  return withFallback(
    (modelAssetPath) =>
      HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        runningMode,
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    "/mediapipe/hand_landmarker.task",
    HOSTED_HAND_MODEL,
  );
}

/**
 * Reserve a monotonically increasing VIDEO-mode timestamp range.
 * MediaPipe rejects any timestamp ≤ the previous one on the same landmarker instance.
 */
export function allocVideoTimestamps(spanMs: number): { startMs: number; endMs: number } {
  const startMs = nextVideoTimestampMs;
  const endMs = startMs + Math.max(1, Math.ceil(spanMs));
  nextVideoTimestampMs = endMs + 1000;
  return { startMs, endMs };
}

/** MediaPipe HandLandmarker in VIDEO mode for analysing files, loaded once per page. */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  loadingHands ??= createHandLandmarker("VIDEO").catch((e) => {
    loadingHands = null; // allow a retry
    throw e;
  });
  return loadingHands;
}

/**
 * A second landmarker for the live camera. VIDEO mode needs ever-increasing timestamps per
 * instance; the live view runs on the camera clock while file analysis runs on its own, so
 * they must not share one.
 */
export function loadLiveHandLandmarker(): Promise<HandLandmarker> {
  loadingLiveHands ??= createHandLandmarker("VIDEO").catch((e) => {
    loadingLiveHands = null;
    throw e;
  });
  return loadingLiveHands;
}

/**
 * IMAGE-mode landmarker for researcher replay (seek-to-frame). No timestamp clock —
 * each `detect()` is independent, so it won't clash with check-in VIDEO analysis.
 */
export function loadImageHandLandmarker(): Promise<HandLandmarker> {
  loadingImageHands ??= createHandLandmarker("IMAGE").catch((e) => {
    loadingImageHands = null;
    throw e;
  });
  return loadingImageHands;
}

/** MediaPipe ImageEmbedder (MobileNet-V3 Small), configured like services/cv/app/embedding.py. */
export function loadImageEmbedder(): Promise<ImageEmbedder> {
  loadingEmbedder ??= (async () => {
    const { ImageEmbedder } = await import("@mediapipe/tasks-vision");
    const fs = await fileset();
    return withFallback(
      (modelAssetPath) =>
        ImageEmbedder.createFromOptions(fs, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          runningMode: "IMAGE",
          l2Normalize: true,
          quantize: false,
        }),
      "/mediapipe/mobilenet_v3_small.tflite",
      HOSTED_EMBEDDER_MODEL,
    );
  })().catch((e) => {
    loadingEmbedder = null;
    throw e;
  });
  return loadingEmbedder;
}
