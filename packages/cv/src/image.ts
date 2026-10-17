/**
 * OpenCV-compatible 8-bit image math, used by the on-device CV modules.
 *
 * Formulas follow OpenCV's integer code paths (cvtColor RGB2Gray / RGB2YCrCb_i / RGB2Lab_b,
 * bit-exact GaussianBlur, MORPH_ELLIPSE, default border handling) so results match
 * services/cv. See test/parity.test.ts.
 */

/** Interleaved RGBA, as returned by canvas getImageData. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Single-channel 8-bit image. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const descale = (x: number, n: number) => (x + (1 << (n - 1))) >> n;
const sat8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Round half to even, like cvRound / rint. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** BORDER_REFLECT_101 index. */
function reflect101(i: number, n: number): number {
  if (n === 1) return 0;
  while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i;
  return i;
}

// ---------- color conversions ----------

const R2Y = 4899, G2Y = 9617, B2Y = 1868, YUV_SHIFT = 14;

// cvtColor(BGR2GRAY) on 8-bit input uses 15-bit coefficients (RY15/GY15/BY15)
const RY15 = 9798, GY15 = 19235, BY15 = 3735;

export function toGray(img: RGBAImage): GrayImage {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = descale(data[i] * RY15 + data[i + 1] * GY15 + data[i + 2] * BY15, 15);
  }
  return { width, height, data: out };
}

const YCRI = 11682, YCBI = 9241;

/** Planar Y, Cr, Cb (8-bit) for an RGBA image. */
export function toYCrCb(img: RGBAImage): [Uint8Array, Uint8Array, Uint8Array] {
  const n = img.width * img.height;
  const Y = new Uint8Array(n), Cr = new Uint8Array(n), Cb = new Uint8Array(n);
  const d = img.data;
  const delta = 128 << YUV_SHIFT;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = descale(r * R2Y + g * G2Y + b * B2Y, YUV_SHIFT);
    Y[p] = sat8(y);
    Cr[p] = sat8(descale((r - y) * YCRI + delta, YUV_SHIFT));
    Cb[p] = sat8(descale((b - y) * YCBI + delta, YUV_SHIFT));
  }
  return [Y, Cr, Cb];
}

const scratch = new DataView(new ArrayBuffer(8));
function f64FromRaw(hi: number, lo: number): number {
  scratch.setUint32(0, hi);
  scratch.setUint32(4, lo);
  return scratch.getFloat64(0);
}
// coefficients of OpenCV's f32_cbrt rational polynomial (modules/core/src/softfloat.cpp)
const CBRT_A = [
  [0x4046a09e, 0x6653ba70], [0x406808f4, 0x6c6116e0], [0x405dca97, 0x439cae14], [0x402add70, 0xd2827500],
  [0x3fc4f15f, 0x83f55d2d], [0x402d9e20, 0x660edb21], [0x4062ff15, 0xc0285815], [0x406510d0, 0x6a8112ce],
  [0x4040fecb, 0xc9e2c375],
].map(([hi, lo]) => f64FromRaw(hi, lo));

/**
 * cv::cbrt(softfloat): OpenCV's software cube root. It is not correctly rounded (the mantissa is
 * truncated), so Math.cbrt would disagree in the last bit and shift a few CIELAB table entries.
 */
export function cvCbrtF32(x: number): number {
  scratch.setFloat32(0, x);
  const bits = scratch.getUint32(0);
  if ((bits & 0x7fffffff) === 0) return 0;
  const s = bits >>> 31;
  let ex = ((bits >>> 23) & 0xff) - 127;
  const frac = bits & 0x7fffff;
  let shx = ex % 3;
  shx -= shx >= 0 ? 3 : 0;
  ex = (ex - shx) / 3 - 1;
  let fr = f64FromRaw(((shx + 1023) << 20) | (frac >>> 3), ((frac & 7) << 29) >>> 0); // 0.125 <= fr < 1
  const [A1, A2, A3, A4, A5, A6, A7, A8, A9] = CBRT_A;
  fr = ((((A1 * fr + A2) * fr + A3) * fr + A4) * fr + A5) / ((((A6 * fr + A7) * fr + A8) * fr + A9) * fr + 1);
  scratch.setFloat64(0, fr);
  const top23 = ((scratch.getUint32(0) & 0xfffff) << 3) | (scratch.getUint32(4) >>> 29);
  scratch.setUint32(0, ((s << 31) | ((ex + 127) << 23) | top23) >>> 0);
  return scratch.getFloat32(0);
}

// CIELAB tables, mirroring OpenCV's createLabTabs() for the 8-bit path.
const LAB_SHIFT = 12, GAMMA_SHIFT = 3, LAB_SHIFT2 = LAB_SHIFT + GAMMA_SHIFT;
const f32 = Math.fround;
let labTables: { gamma: Uint16Array; cbrt: Uint16Array; coeffs: number[] } | null = null;

function getLabTables() {
  if (labTables) return labTables;
  const gamma = new Uint16Array(256);
  const intScale = f32(255 * (1 << GAMMA_SHIFT));
  for (let i = 0; i < 256; i++) {
    const x = f32(i / 255);
    const g = x <= 809 / 20000 ? x / (323 / 25) : Math.pow((x + 11 / 200) / (1 + 11 / 200), 12 / 5);
    gamma[i] = roundHalfEven(f32(intScale * f32(g)));
  }
  const lthresh = f32(216 / 24389), lscale = f32(841 / 108), lbias = f32(16 / 116);
  const size = (256 * 3) / 2 * (1 << GAMMA_SHIFT);
  const cbrt = new Uint16Array(size);
  const cbScale = f32(1 / f32(255 * (1 << GAMMA_SHIFT)));
  const lshift2 = 1 << LAB_SHIFT2;
  for (let i = 0; i < size; i++) {
    const x = f32(cbScale * i);
    const v = x < lthresh ? f32(x * lscale + lbias) : cvCbrtF32(x);
    cbrt[i] = roundHalfEven(f32(lshift2 * v));
  }
  // sRGB→XYZ (D65) rows, divided by the white point, in 12-bit fixed point
  const m = [
    [0.412453, 0.35758, 0.180423],
    [0.212671, 0.71516, 0.072169],
    [0.019334, 0.119193, 0.950227],
  ];
  const white = [0.950456, 1, 1.088754];
  const coeffs: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) coeffs.push(roundHalfEven(((1 << LAB_SHIFT) * m[r][c]) / white[r]));
  labTables = { gamma, cbrt, coeffs };
  return labTables;
}

/** Planar 8-bit L, a, b exactly as cv2.cvtColor(..., COLOR_BGR2LAB) stores them (a, b offset by 128). */
export function toLab(img: RGBAImage): [Uint8Array, Uint8Array, Uint8Array] {
  const { gamma, cbrt, coeffs: C } = getLabTables();
  const n = img.width * img.height;
  const L = new Uint8Array(n), A = new Uint8Array(n), B = new Uint8Array(n);
  const d = img.data;
  const Lscale = Math.trunc((116 * 255 + 50) / 100);
  const Lshift = -Math.trunc((16 * 255 * (1 << LAB_SHIFT2) + 50) / 100);
  const ab = 128 * (1 << LAB_SHIFT2);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = gamma[d[i]], g = gamma[d[i + 1]], b = gamma[d[i + 2]];
    const fX = cbrt[descale(r * C[0] + g * C[1] + b * C[2], LAB_SHIFT)];
    const fY = cbrt[descale(r * C[3] + g * C[4] + b * C[5], LAB_SHIFT)];
    const fZ = cbrt[descale(r * C[6] + g * C[7] + b * C[8], LAB_SHIFT)];
    L[p] = sat8(descale(Lscale * fY + Lshift, LAB_SHIFT2));
    A[p] = sat8(descale(500 * (fX - fY) + ab, LAB_SHIFT2));
    B[p] = sat8(descale(200 * (fY - fZ) + ab, LAB_SHIFT2));
  }
  return [L, A, B];
}

// ---------- filtering ----------

/** 8-bit Gaussian kernels as OpenCV's bit-exact GaussianBlur uses them (sigma = 0), in 1/256 units. */
const GAUSS_KERNELS: Record<number, number[]> = {
  5: [16, 64, 96, 64, 16],
  9: [4, 13, 30, 51, 60, 51, 30, 13, 4],
};

/** cv2.GaussianBlur(img, (k, k), 0) for k ∈ {5, 9}; alpha is copied through. */
export function gaussianBlur(img: RGBAImage, ksize: 5 | 9): RGBAImage {
  const k = GAUSS_KERNELS[ksize];
  const half = ksize >> 1;
  const { width: w, height: h, data } = img;
  const tmp = new Int32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0, s1 = 0, s2 = 0;
      for (let t = 0; t < ksize; t++) {
        const i = (y * w + reflect101(x + t - half, w)) * 4;
        s0 += k[t] * data[i];
        s1 += k[t] * data[i + 1];
        s2 += k[t] * data[i + 2];
      }
      const o = (y * w + x) * 3;
      tmp[o] = s0;
      tmp[o + 1] = s1;
      tmp[o + 2] = s2;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0, s1 = 0, s2 = 0;
      for (let t = 0; t < ksize; t++) {
        const o = (reflect101(y + t - half, h) * w + x) * 3;
        s0 += k[t] * tmp[o];
        s1 += k[t] * tmp[o + 1];
        s2 += k[t] * tmp[o + 2];
      }
      const i = (y * w + x) * 4;
      out[i] = sat8((s0 + 32768) >> 16);
      out[i + 1] = sat8((s1 + 32768) >> 16);
      out[i + 2] = sat8((s2 + 32768) >> 16);
      out[i + 3] = data[i + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** cv2.Laplacian(gray, CV_64F) with ksize=1: [[0,1,0],[1,-4,1],[0,1,0]], BORDER_REFLECT_101. */
export function laplacian(gray: GrayImage): Float64Array {
  const { width: w, height: h, data } = gray;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const up = reflect101(y - 1, h) * w, down = reflect101(y + 1, h) * w, row = y * w;
    for (let x = 0; x < w; x++) {
      out[row + x] = data[up + x] + data[down + x] + data[row + reflect101(x - 1, w)] + data[row + reflect101(x + 1, w)] - 4 * data[row + x];
    }
  }
  return out;
}

/** Laplacian variance (focus measure), optionally restricted to a mask. */
export function laplacianVariance(gray: GrayImage, mask?: Uint8Array): number {
  const lap = laplacian(gray);
  return mask ? variance(lap.filter((_, i) => mask[i] !== 0)) : variance(lap);
}

// ---------- morphology ----------

/** cv2.getStructuringElement(MORPH_ELLIPSE, (k, k)) as (dy, dx) offsets. */
export function ellipseOffsets(k: number): [number, number][] {
  const r = k >> 1, c = k >> 1;
  const offsets: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const dy = i - r;
    const dx = roundHalfEven(c * Math.sqrt(((r * r - dy * dy) * 1) / (r * r)));
    for (let j = Math.max(c - dx, 0); j < Math.min(c + dx + 1, k); j++) offsets.push([dy, j - c]);
  }
  return offsets;
}

/** Binary erode/dilate on a 0/1 mask; out-of-image pixels never affect the result (OpenCV default). */
function morph(mask: Uint8Array, w: number, h: number, offsets: [number, number][], erode: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (const [dy, dx] of offsets) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const m = mask[yy * w + xx];
        if (erode ? m === 0 : m !== 0) {
          v = erode ? 0 : 1;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export function morphOpen(mask: Uint8Array, w: number, h: number, k = 7): Uint8Array {
  const o = ellipseOffsets(k);
  return morph(morph(mask, w, h, o, true), w, h, o, false);
}

export function morphClose(mask: Uint8Array, w: number, h: number, k = 7): Uint8Array {
  const o = ellipseOffsets(k);
  return morph(morph(mask, w, h, o, false), w, h, o, true);
}

// ---------- statistics (NumPy semantics) ----------

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
}

/** Population variance (ddof=0), like ndarray.var(). */
export function variance(xs: ArrayLike<number>): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return xs.length ? s / xs.length : NaN;
}

export function std(xs: ArrayLike<number>, ddof = 0): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - ddof));
}

/** np.percentile with the default 'linear' method. */
export function percentile(xs: ArrayLike<number>, p: number, sorted = false): number {
  const a = sorted ? (xs as number[]) : Float64Array.from(xs).sort();
  if (!a.length) return NaN;
  const pos = (p / 100) * (a.length - 1);
  const lo = Math.floor(pos), hi = Math.min(lo + 1, a.length - 1);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
