import "server-only";
import { z } from "zod";

/**
 * Shared request shapes for Droid module generation (DB-backed).
 * GitHub Actions dispatch was removed; generation runs in-process via
 * Factory Droid + Daytona and writes candidate results to droid_jobs.
 */

export const DroidRequestInput = z.object({
  condition: z.string().min(2).max(80),
  measurement: z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, "snake_case"),
    label: z.string().min(1).max(80),
    unit: z.string().min(1).max(80),
  }),
  media_type: z.enum(["photo", "video"]),
  description: z.string().max(2000).default(""),
  dataset_hint: z.string().max(300).optional(),
  study_id: z.string().max(60).optional(),
  task: z.unknown().optional(),
});
export type DroidRequestInput = z.infer<typeof DroidRequestInput>;

export function newRequestId(measurementName: string, now = Date.now()): string {
  const base = measurementName.replace(/_/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "model";
  return `${base}-${now.toString(36)}`.slice(0, 41);
}
