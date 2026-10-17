import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRETRAINED, PRETRAINED_MODELS } from "./pretrained";
import { applyModel } from "./models";

const STUDIES = fileURLToPath(new URL("../../../training/studies", import.meta.url));

describe("pretrained models bundle", () => {
  it("matches training/studies/*/model.json (regenerate: python -m vfcv.publish, in training/)", () => {
    const onDisk = readdirSync(STUDIES)
      .filter((d) => existsSync(join(STUDIES, d, "model.json")))
      .sort()
      .map((d) => JSON.parse(readFileSync(join(STUDIES, d, "model.json"), "utf8")));
    expect(JSON.parse(JSON.stringify(PRETRAINED_MODELS))).toEqual(onDisk);
  });

  it("every model is well-formed, starts as needs-validation and records where it came from", () => {
    const ids = new Set<string>();
    for (const { model: m, card } of PRETRAINED) {
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
      expect(m.weights).toHaveLength(m.features.length);
      expect(m.feature_means).toHaveLength(m.features.length);
      expect(m.feature_stds).toHaveLength(m.features.length);
      expect(m.status).toBe("reusable_needs_validation");
      expect(m.provenance?.licence).toBeTruthy();
      expect(card).toContain(m.name);
    }
  });

  it("predictions stay inside the label range on the training means", () => {
    for (const m of PRETRAINED_MODELS) {
      const atMean = Object.fromEntries(m.features.map((f, j) => [f, m.feature_means[j]]));
      const p = applyModel(m, atMean)!;
      expect(p.value).toBeCloseTo(Math.min(m.metrics.label_max, Math.max(m.metrics.label_min, m.intercept)), 9);
    }
  });
});
