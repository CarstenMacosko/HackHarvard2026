"use client";

import type { HandLandmarker } from "@mediapipe/tasks-vision";

const HOSTED_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let loading: Promise<HandLandmarker> | null = null;

/** MediaPipe HandLandmarker in VIDEO mode, loaded once per page. WASM and model are self-hosted. */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  loading ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const create = (modelAssetPath: string) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await create("/mediapipe/hand_landmarker.task");
    } catch {
      return await create(HOSTED_MODEL);
    }
  })().catch((e) => {
    loading = null; // allow a retry
    throw e;
  });
  return loading;
}
