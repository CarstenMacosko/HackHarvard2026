"use client";

import type { HandLandmarker, ImageEmbedder } from "@mediapipe/tasks-vision";

const HOSTED_HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const HOSTED_EMBEDDER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite";
let loadingHands: Promise<HandLandmarker> | null = null;
let loadingEmbedder: Promise<ImageEmbedder> | null = null;

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

/** MediaPipe HandLandmarker in VIDEO mode, loaded once per page. */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  loadingHands ??= (async () => {
    const { HandLandmarker } = await import("@mediapipe/tasks-vision");
    const fs = await fileset();
    return withFallback(
      (modelAssetPath) =>
        HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
      "/mediapipe/hand_landmarker.task",
      HOSTED_HAND_MODEL,
    );
  })().catch((e) => {
    loadingHands = null; // allow a retry
    throw e;
  });
  return loadingHands;
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
