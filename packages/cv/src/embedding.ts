import { pyRound } from "./quality";

/**
 * General-purpose image embedding feature group (mirror of services/cv/app/embedding.py):
 * MediaPipe Image Embedder, MobileNet-V3 Small, L2-normalised, 1,024 values named
 * `mnv3s_0` … `mnv3s_1023`. Stored to 6 decimals, like every other feature.
 */
export const EMBEDDER = { id: "mnv3s", dim: 1024, model: "mobilenet_v3_small.tflite" } as const;

export const EMBEDDING_FEATURE_NAMES = Array.from({ length: EMBEDDER.dim }, (_, i) => `${EMBEDDER.id}_${i}`);

export function embeddingFeatures(vector: ArrayLike<number>): Record<string, number> {
  if (vector.length !== EMBEDDER.dim) throw new Error(`expected a ${EMBEDDER.dim}-value embedding, got ${vector.length}`);
  const out: Record<string, number> = {};
  for (let i = 0; i < EMBEDDER.dim; i++) out[EMBEDDING_FEATURE_NAMES[i]] = pyRound(vector[i], 6);
  return out;
}

/** True if a model reads embedding features (so captures need an embedding before it applies). */
export function usesEmbedding(features: string[]): boolean {
  return features.some((f) => f.startsWith(`${EMBEDDER.id}_`));
}
