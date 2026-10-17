import { describe, expect, it } from "vitest";
import { analyzeTapping, buildReport, handVideoChecks, type GrayImage } from "../src";

function img(w: number, h: number, fill: (x: number, y: number) => number): GrayImage {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = fill(x, y);
  return { width: w, height: h, data };
}
const criteria = { blur: 20, exposure_min: 60, exposure_max: 220 };
const flat = img(64, 64, () => 150);
const detailed = img(64, 64, (x, y) => ((x * 7 + y * 13) % 5) * 30 + 60);

describe("advisory checks (mirror of services/cv quality.build_report)", () => {
  it("a failing advisory check is recorded but does not reject", () => {
    const r = buildReport([{ name: "blur", passed: false, value: 3, threshold: 20, message: "soft", advisory: true }]);
    expect(r.accepted).toBe(true);
    expect(r.retry_instructions).toBeNull();
  });
  it("a failing blocking check still rejects, and only blocking messages are retry instructions", () => {
    const r = buildReport([
      { name: "blur", passed: false, value: 3, threshold: 20, message: "soft", advisory: true },
      { name: "exposure", passed: false, value: 30, threshold: 60, message: "dark" },
    ]);
    expect(r.accepted).toBe(false);
    expect(r.retry_instructions).toBe("dark Then send it again 🙏");
  });
});

describe("hand-region video checks", () => {
  it("judges sharpness and brightness on the hand crops (medians)", () => {
    const [blur, exposure] = handVideoChecks([flat], [detailed, detailed, flat], criteria);
    expect(blur.advisory).toBe(true);
    expect(blur.passed).toBe(true); // median of three crops, two of them detailed
    expect(exposure.advisory).toBeFalsy();
  });
  it("falls back to the middle frame when no hand was found, and skips tracks without frames", () => {
    const [blur] = handVideoChecks([flat, flat, flat], [], criteria);
    expect(blur.value).toBe(0);
    expect(blur.passed).toBe(false);
    expect(handVideoChecks([], [], criteria)).toEqual([]);
  });
  it("a soft but well-tracked tapping video is accepted and measured", () => {
    const fps = 30;
    const distance = Array.from({ length: 300 }, (_, i) => 0.1 + 0.5 - 0.5 * Math.cos((2 * Math.PI * 2.5 * i) / fps));
    const res = analyzeTapping({ fps, duration_s: 10, gray_samples: [flat], hand_crops: [flat, flat, flat], distance, detection_rate: 1 });
    expect(res.quality.accepted).toBe(true);
    expect(res.quality.checks.find((c) => c.name === "blur")).toMatchObject({ passed: false, advisory: true });
    expect(res.measurements.find((m) => m.name === "tap_rate_hz")?.value).toBeCloseTo(2.5, 1);
  });
});
