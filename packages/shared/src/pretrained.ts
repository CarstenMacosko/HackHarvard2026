import { z } from "zod";
import raw from "./pretrained/models.json";
import { CvModel } from "./schemas";

/**
 * Models trained outside the browser by the training kit (training/, or Droid running it in
 * GitHub Actions) on public or synthetic datasets. Bundled from training/studies/<id>/ by
 * `python -m vfcv.publish`; the web app offers them as built-in models.
 *
 * A separate entry point (`@vf/shared/pretrained`) because the weights are large and only the
 * server needs them.
 */
const SubgroupRow = z.object({
  n: z.number(),
  mae: z.number().optional(),
  r: z.number().nullable().optional(),
  auc: z.number().nullable().optional(),
  n_positive: z.number().optional(),
  excluded_by_quality: z.number(),
  exclusion_rate: z.number().nullable(),
});

export const PretrainedEntry = z.object({
  study: z.string(),
  model: CvModel,
  evaluation: z.object({
    n_captures: z.number(),
    n_groups: z.number(),
    n_labelled: z.number(),
    n_excluded_quality: z.number(),
    excluded_reasons: z.record(z.number()),
    overall: z.object({ n: z.number(), mae: z.number(), r: z.number().nullable(), auc: z.number().nullable().optional(), n_positive: z.number().optional() }),
    subgroups: z
      .object({
        groups: z.record(SubgroupRow),
        worst: z.object({ name: z.string(), metric: z.string(), value: z.number(), n: z.number() }).nullable(),
      })
      .optional(),
  }),
  card: z.string(),
});
export type PretrainedEntry = z.infer<typeof PretrainedEntry>;

export const PRETRAINED: PretrainedEntry[] = z.array(PretrainedEntry).parse(raw);
export const PRETRAINED_MODELS: CvModel[] = PRETRAINED.map((e) => e.model);
