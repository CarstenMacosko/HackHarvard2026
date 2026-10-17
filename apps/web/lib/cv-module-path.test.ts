import path from "node:path";
import { describe, expect, it } from "vitest";
import { cvModuleDirectory } from "./cv-module-path";

describe("cvModuleDirectory", () => {
  it("finds the actual CV service package from the web workspace and repository root", () => {
    const web = process.cwd();
    const root = path.resolve(web, "../..");
    const expected = path.join(root, "services/cv/app/modules");
    expect(cvModuleDirectory(web)).toBe(expected);
    expect(cvModuleDirectory(root)).toBe(expected);
  });

  it("refuses to create a lookalike package when the CV service is absent", () => {
    expect(() => cvModuleDirectory("/private/tmp/no-cv-service-here")).toThrow(/landmark evaluation requires writing_posture_core.py/);
  });
});
