import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { buildSetup } from "../../../supabase/make-setup.mjs";

describe("supabase/setup.sql", () => {
  it("matches the migrations and seed (regenerate: node supabase/make-setup.mjs)", () => {
    expect(readFileSync(new URL("../../../supabase/setup.sql", import.meta.url), "utf8")).toBe(buildSetup());
  });
});
