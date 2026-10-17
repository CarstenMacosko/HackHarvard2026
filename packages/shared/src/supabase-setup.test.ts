import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { buildDoc, buildSetup } from "../../../supabase/make-setup.mjs";

describe("generated database files (regenerate: node supabase/make-setup.mjs)", () => {
  it("supabase/setup.sql matches the migrations and seed", () => {
    expect(readFileSync(new URL("../../../supabase/setup.sql", import.meta.url), "utf8")).toBe(buildSetup());
  });
  it("docs/DATABASE.md documents the current migrations", () => {
    expect(readFileSync(new URL("../../../docs/DATABASE.md", import.meta.url), "utf8")).toBe(buildDoc());
  });
});
