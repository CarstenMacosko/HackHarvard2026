import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ridgeFixture } from "../scripts/ridge-fixture";

describe("ridge fixture for the Python training kit", () => {
  it("is up to date (regenerate: npx tsx packages/shared/scripts/export-ridge-fixture.ts)", () => {
    const saved = JSON.parse(readFileSync(new URL("../../../training/tests/fixtures/ridge_ts.json", import.meta.url), "utf8"));
    expect(JSON.parse(JSON.stringify(ridgeFixture()))).toEqual(saved);
  });
});
