import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { analyzeSkinPhoto, analyzeTapping, analyzeTremor, ellipseOffsets, pyRound, tapMetrics, tappingFromTrack, TaskNotCompleted, tremorMetrics, welch, type RGBAImage } from "../src";

/** Fixtures written by services/cv/scripts/export_parity_fixtures.py from the Python modules. */
const FIX = join(__dirname, "..", "fixtures");
const expected = JSON.parse(readFileSync(join(FIX, "expected.json"), "utf8"));
const tremor = JSON.parse(readFileSync(join(FIX, "tremor.json"), "utf8"));

function loadPng(file: string): RGBAImage {
  const png = PNG.sync.read(readFileSync(join(FIX, file)));
  return { width: png.width, height: png.height, data: png.data };
}

/** |a - b| within an absolute or relative tolerance. */
function close(a: number, b: number, abs: number, rel = 0) {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(Math.max(abs, rel * Math.abs(b)));
}

describe("image primitives", () => {
  it("ellipse structuring element matches cv2.getStructuringElement(MORPH_ELLIPSE, (7, 7))", () => {
    const rows = [
      "0001000",
      "0111110",
      "1111111",
      "1111111",
      "1111111",
      "0111110",
      "0001000",
    ];
    const grid = Array.from({ length: 7 }, () => Array(7).fill("0"));
    for (const [dy, dx] of ellipseOffsets(7)) grid[dy + 3][dx + 3] = "1";
    expect(grid.map((r) => r.join(""))).toEqual(rows);
  });
});

describe("eczema_photo parity with Python", () => {
  for (const [name, exp] of Object.entries<any>(expected.photos)) {
    it(name, () => {
      const res = analyzeSkinPhoto(loadPng(exp.file));
      expect(res.quality.accepted).toBe(exp.accepted);
      for (const c of res.quality.checks) {
        const e = exp.checks[c.name];
        expect(c.passed, c.name).toBe(e.passed);
        close(c.value!, e.value, 1e-6, 1e-9);
      }
      expect(Object.keys(exp.checks).sort()).toEqual(res.quality.checks.map((c) => c.name).sort());
      expect(res.measurements.map((m) => m.name).sort()).toEqual(Object.keys(exp.measurements).sort());
      for (const m of res.measurements) {
        close(m.value, exp.measurements[m.name].value, 1e-3, 1e-5);
        close(m.uncertainty!, exp.measurements[m.name].uncertainty, 1e-3, 1e-4);
      }
      expect(Object.keys(res.features).sort()).toEqual(Object.keys(exp.features).sort());
      for (const [k, v] of Object.entries(res.features)) close(v, exp.features[k], 1e-6, 1e-7);
    });
  }
});

describe("finger_tapping signal parity with Python", () => {
  for (const [name, c] of Object.entries<any>(expected.taps)) {
    it(name, () => {
      const signal = c.signal.map((v: number | null) => (v === null ? NaN : v));
      if (c.expected_error) {
        expect(() => tapMetrics(signal, c.fps, c.detection_rate)).toThrow(TaskNotCompleted);
        expect(() => tapMetrics(signal, c.fps, c.detection_rate)).toThrow(c.expected_error);
        return;
      }
      const m = tapMetrics(signal, c.fps, c.detection_rate);
      for (const [k, v] of Object.entries<number>(c.expected)) close((m as any)[k], v, 1e-9, 1e-9);
    });
  }
});

describe("hand_tremor signal parity with Python", () => {
  for (const [name, c] of Object.entries<any>(tremor)) {
    it(name, () => {
      const lm: number[][][] = c.landmarks.map((f: (number | null)[][]) => f.map((pt) => pt.map((v) => (v === null ? NaN : v))));
      if (c.expected_error) {
        expect(() => tremorMetrics(lm, c.fps)).toThrow(TaskNotCompleted);
        expect(() => tremorMetrics(lm, c.fps)).toThrow(c.expected_error);
        return;
      }
      const m = tremorMetrics(lm, c.fps);
      for (const [k, v] of Object.entries<number>(c.expected)) close((m as any)[k], v, 1e-9, 1e-7);
    });
  }

  it("welch matches the closed form for a pure sinusoid", () => {
    const fs = 30, n = 300;
    const x = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 6 * i) / fs));
    const { f, p } = welch(x, fs, 120);
    const df = f[1] - f[0];
    expect(f[p.indexOf(Math.max(...p))]).toBeCloseTo(6, 6);
    close(p.reduce((s, v) => s + v, 0) * df, 0.5, 0.01); // variance of a unit sinusoid
  });

  it("module pipeline on a landmark track: no frames → no image checks", () => {
    const c = tremor.clean_5hz;
    const lm: number[][][] = c.landmarks;
    const track = { fps: c.fps, duration_s: lm.length / c.fps, gray_samples: [], landmarks: lm, detection_rate: 1 };
    const res = analyzeTremor(track);
    expect(res.quality.checks.map((q) => q.name)).toEqual(["duration_s", "fps", "hand_visible"]);
    expect(res.quality.accepted).toBe(true);
    close(res.features.tremor_freq_hz, c.expected.freq_hz, 1e-6); // features are stored to 6 decimals
    expect(res.model_version).toBe("hand_tremor@0.1.0");
    // the same track drives finger tapping through tappingFromTrack
    expect(tappingFromTrack(track).distance).toHaveLength(lm.length);
    expect(analyzeTapping(tappingFromTrack(track)).quality.accepted).toBe(false); // a still hand is not tapping
  });
});

describe("pyRound matches Python's round()", () => {
  // expected values computed with CPython: round(x, d)
  const cases: [number, number, number][] = [
    [0.0078125, 6, 0.007812],
    [0.0959375, 6, 0.095937],
    [2.675, 2, 2.67],
    [0.5, 0, 0],
    [1.5, 0, 2],
    [2.5, 0, 2],
    [1312.6499999, 1, 1312.6],
    [-0.0078125, 6, -0.007812],
    [12.3456785, 6, 12.345678],
    [149.95, 1, 149.9],
  ];
  for (const [x, d, want] of cases) it(`round(${x}, ${d})`, () => expect(pyRound(x, d)).toBe(want));
});
