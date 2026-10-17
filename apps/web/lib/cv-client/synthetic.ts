"use client";

/**
 * Synthetic labelled skin photos for trying the training wizard without real data. Each image
 * has a skin tone, a reddened patch of random size and intensity, and sensor noise of varying strength; its
 * label is a simulated clinician grade (0–4) that depends on redness and extent plus rater noise.
 * Clearly synthetic: never use for validation.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TONES: [number, number, number][] = [
  [215, 170, 150], // RGB
  [200, 150, 120],
  [175, 128, 98],
  [150, 105, 80],
];

export async function syntheticSkinDataset(n = 40, seed = 7): Promise<{ file: File; label: number }[]> {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const W = 320, H = 240;
  const out: { file: File; label: number }[] = [];
  for (let i = 0; i < n; i++) {
    const tone = TONES[i % TONES.length];
    const redness = 5 + r() * 55;
    const noise = 6 + r() * 8; // vary camera noise so models can't lean on it
    const frac = 0.05 + r() * 0.4;
    const pw = Math.round(Math.sqrt(frac) * W), ph = Math.round(Math.sqrt(frac) * H);
    const x0 = Math.round(r() * (W - pw)), y0 = Math.round(r() * (H - ph));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const inPatch = x >= x0 && x < x0 + pw && y >= y0 && y < y0 + ph;
        const [R, G, B] = inPatch ? [tone[0] + redness / 4, tone[1] - redness, tone[2] - redness / 2] : tone;
        img.data[k] = R + gauss() * noise;
        img.data[k + 1] = G + gauss() * noise;
        img.data[k + 2] = B + gauss() * noise;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
    const grade = Math.min(4, Math.max(0, 0.045 * redness + 3.2 * frac + gauss() * 0.25));
    out.push({ file: new File([blob], `synthetic_${String(i + 1).padStart(3, "0")}.png`, { type: "image/png" }), label: Math.round(grade * 2) / 2 });
  }
  return out;
}
