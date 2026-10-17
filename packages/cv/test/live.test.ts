import { describe, expect, it } from "vitest";
import { frameGuidance, LIVE, TappingCoach, type LiveFrame } from "../src";

// MediaPipe's landmarks for the open-hand fixture (services/cv/app/synthetic.py HAND_TEMPLATE)
const TEMPLATE = [
  [0.479, 0.742], [0.54, 0.662], [0.577, 0.561], [0.526, 0.502], [0.443, 0.495], [0.473, 0.439], [0.48, 0.329], [0.484, 0.258],
  [0.473, 0.196], [0.391, 0.472], [0.418, 0.422], [0.458, 0.524], [0.451, 0.555], [0.331, 0.518], [0.357, 0.487], [0.408, 0.574],
  [0.4, 0.592], [0.278, 0.574], [0.309, 0.54], [0.355, 0.592], [0.348, 0.61],
];
const W = 720, H = 1280;

/** Hand of `scale` (fraction of the frame width) centred at (cx, cy), thumb–index opening `open` in hand sizes. */
function hand(scale = 0.6, cx = 0.5, cy = 0.5, open = 0.8): number[][] {
  const pts = TEMPLATE.map(([x, y]) => [(x - 0.45) * scale * W + cx * W, (y - 0.47) * scale * W + cy * H]);
  const size = Math.hypot(pts[0][0] - pts[9][0], pts[0][1] - pts[9][1]);
  pts[8] = [pts[4][0], pts[4][1] - open * size]; // index tip straight above the thumb tip
  return pts;
}
const frame = (t: number, pts: number[][] | null, extra: Partial<LiveFrame> = {}): LiveFrame => ({ t, pts, width: W, height: H, brightness: 140, sharpness: 120, ...extra });

describe("frameGuidance: one instruction, most important first", () => {
  it.each([
    ["no_hand", frame(0, null)],
    ["dark", frame(0, hand(), { brightness: 30 })],
    ["bright", frame(0, hand(), { brightness: 240 })],
    ["edge", frame(0, hand(0.6, 0.95))],
    ["far", frame(0, hand(0.12))],
    ["close", frame(0, hand(2.2))],
    ["soft", frame(0, hand(), { sharpness: 5 })],
    ["good", frame(0, hand())],
  ])("%s", (code, f) => {
    expect(frameGuidance(f).code).toBe(code);
  });

  it("whole-hand movement asks for a resting forearm (a warning, not a stop)", () => {
    const g = frameGuidance(frame(0, hand()), LIVE.unsteady + 0.1);
    expect(g.code).toBe("unsteady");
    expect(g.level).toBe("warn");
  });

  it("a dark room is named as the problem even when no hand is found", () => {
    expect(frameGuidance(frame(0, null, { brightness: 25 })).code).toBe("dark");
  });

  it("darkness outranks framing", () => {
    expect(frameGuidance(frame(0, hand(0.12), { brightness: 20 })).code).toBe("dark");
  });
});

describe("TappingCoach", () => {
  const fps = 30;
  const run = (coach: TappingCoach, from: number, seconds: number, make: (t: number) => number[][] | null) => {
    let s = coach.push(frame(from, make(from)));
    for (let i = 1; i <= seconds * fps; i++) {
      const t = from + (i * 1000) / fps;
      s = coach.push(frame(t, make(t)));
    }
    return s;
  };
  const tapping = (hz: number) => (t: number) => hand(0.6, 0.5, 0.5, 0.1 + 0.9 * (0.5 - 0.5 * Math.cos((2 * Math.PI * hz * t) / 1000)));

  it("waits for good framing, then starts on the first taps and finishes after the duration", () => {
    const coach = new TappingCoach(10_000);
    expect(run(coach, 0, 0.5, () => null).phase).toBe("framing");
    const ready = run(coach, 600, 1.5, () => hand());
    expect(ready.phase).toBe("ready");
    expect(ready.taps).toBe(0);
    const started = run(coach, 2200, 2, tapping(3));
    expect(started.phase).toBe("tapping");
    expect(started.tapStart).toBeGreaterThanOrEqual(2200);
    const finished = run(coach, 4300, 9.5, tapping(3));
    expect(finished.done).toBe(true);
    // 3 Hz from t = 2.2 s to 13.8 s: ~35 taps
    expect(finished.taps).toBeGreaterThanOrEqual(33);
    expect(finished.taps).toBeLessThanOrEqual(37);
  });

  it("taps while badly framed don't start the test", () => {
    const coach = new TappingCoach();
    const s = run(coach, 0, 3, (t) => (t % 1000 < 500 ? null : tapping(3)(t)));
    expect(s.phase).not.toBe("tapping");
  });

  it("a still hand is not tapping (landmark jitter stays below the minimum opening range)", () => {
    const coach = new TappingCoach();
    const s = run(coach, 0, 4, (t) => hand(0.6, 0.5, 0.5, 0.8 + 0.01 * Math.sin(t)));
    expect(s.phase).toBe("ready");
    expect(s.taps).toBe(0);
  });
});
