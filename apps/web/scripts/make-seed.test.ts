import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeeds } from "./make-seed";

const supabase = join(__dirname, "../../../supabase");

describe("supabase seed", () => {
  it("match the demo generator (run: npx tsx apps/web/scripts/make-seed.ts)", () => {
    expect(readFileSync(join(supabase, "seed.sql"), "utf8")).toBe(buildSeeds().seed);
  });
});
