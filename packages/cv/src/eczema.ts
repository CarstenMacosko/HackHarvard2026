import { gaussianBlur, laplacian, mean, morphClose, morphOpen, percentile, std, toGray, toLab, toYCrCb, variance, type GrayImage, type RGBAImage } from "./image";
import { blurCheck, exposureCheck, fractionCheck, measurement, runPipeline, TaskNotCompleted, type ModuleResult } from "./quality";

/** Mirror of services/cv/app/modules/eczema.py (EczemaPhotoModule). */
export const ECZEMA_MODULE = {
  id: "eczema_photo",
  version: "0.2.0",
  media_type: "photo" as const,
  measurements: [
    { name: "erythema_index", label: "Erythema index", unit: "Δa*" },
    { name: "affected_area_pct", label: "Affected area", unit: "% of skin" },
  ],
  feature_names: [
    "erythema_index",
    "affected_area_pct",
    "skin_coverage",
    "skin_l_mean",
    "skin_a_mean",
    "skin_b_mean",
    "skin_a_std",
    "a_ref",
    "a_p90_delta",
    "texture_laplacian_var",
    "a_bin_neg",
    "a_bin_0_4",
    "a_bin_4_8",
    "a_bin_8_12",
    "a_bin_12_16",
    "a_bin_16_plus",
  ],
  default_criteria: { blur: 15, exposure_min: 70, exposure_max: 210, skin_coverage: 0.25 } as Record<string, number>,
};

const AFFECTED_DELTA_A = 8;
const DELTA_SENSITIVITY = 2;
const MIN_SKIN_PIXELS = 500;
const A_BIN_EDGES = [0, 4, 8, 12, 16];
const COVERAGE_MESSAGE =
  "The skin patch is too small in the photo. Hold your phone about one forearm's length away so the area fills most of the frame.";

/** YCrCb skin rule with OpenCV's open/close cleanup. Returns a 0/1 mask. */
export function skinMask(img: RGBAImage): Uint8Array {
  const [Y, Cr, Cb] = toYCrCb(gaussianBlur(img, 5));
  const n = Y.length;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = Cr[i] >= 133 && Cr[i] <= 205 && Cb[i] >= 77 && Cb[i] <= 135 ? 1 : 0;
  return morphClose(morphOpen(mask, img.width, img.height), img.width, img.height);
}

export interface PreparedPhoto {
  img: RGBAImage;
  gray: GrayImage;
  mask: Uint8Array;
}

export function preparePhoto(img: RGBAImage): PreparedPhoto {
  return { img, gray: toGray(img), mask: skinMask(img) };
}

/** Redness, extent, colour and texture statistics over the skin mask (eczema.photo_features). */
export function photoFeatures(p: PreparedPhoto): Record<string, number> {
  const [L, A, B] = toLab(gaussianBlur(p.img, 9));
  const lap = laplacian(p.gray);
  const skinA: number[] = [], skinL: number[] = [], skinB: number[] = [], skinLap: number[] = [];
  for (let i = 0; i < p.mask.length; i++) {
    if (!p.mask[i]) continue;
    skinA.push(A[i] - 128);
    skinL.push(L[i]);
    skinB.push(B[i] - 128);
    skinLap.push(lap[i]);
  }
  if (skinA.length < MIN_SKIN_PIXELS) {
    throw new TaskNotCompleted("I couldn't find enough skin in the photo. Move closer so the patch fills most of the frame.");
  }
  const sortedA = Float64Array.from(skinA).sort();
  const ref = percentile(sortedA, 25, true);
  const delta = skinA.map((a) => a - ref);
  const area = (d: number) => (delta.filter((x) => x > d).length / delta.length) * 100;
  const affected = skinA.filter((a) => a - ref > AFFECTED_DELTA_A);
  const bins = new Array(A_BIN_EDGES.length + 1).fill(0);
  for (const d of delta) {
    let b = 0;
    while (b < A_BIN_EDGES.length && d >= A_BIN_EDGES[b]) b++;
    bins[b]++;
  }
  return {
    erythema_index: affected.length ? mean(affected) - ref : 0,
    affected_area_pct: area(AFFECTED_DELTA_A),
    skin_coverage: mean(p.mask),
    skin_l_mean: (mean(skinL) * 100) / 255,
    skin_a_mean: mean(skinA),
    skin_b_mean: mean(skinB),
    skin_a_std: std(skinA),
    a_ref: ref,
    a_p90_delta: percentile(delta, 90),
    texture_laplacian_var: variance(skinLap),
    a_bin_neg: bins[0] / delta.length,
    a_bin_0_4: bins[1] / delta.length,
    a_bin_4_8: bins[2] / delta.length,
    a_bin_8_12: bins[3] / delta.length,
    a_bin_12_16: bins[4] / delta.length,
    a_bin_16_plus: bins[5] / delta.length,
    _erythema_unc: affected.length > 1 ? std(affected) / Math.sqrt(affected.length) : 0,
    _area_unc: Math.abs(area(AFFECTED_DELTA_A - DELTA_SENSITIVITY) - area(AFFECTED_DELTA_A + DELTA_SENSITIVITY)) / 2,
  };
}

export function eczemaQualityChecks(p: PreparedPhoto, c: Record<string, number>) {
  return [
    blurCheck(p.gray, c.blur),
    exposureCheck(p.gray, c.exposure_min, c.exposure_max),
    fractionCheck("skin_coverage", mean(p.mask), c.skin_coverage, COVERAGE_MESSAGE),
  ];
}

/** Full module run on an RGBA image already scaled to ≤1024 px on its long side. */
export function analyzeSkinPhoto(img: RGBAImage, criteria: Record<string, number> = {}): ModuleResult {
  const c = { ...ECZEMA_MODULE.default_criteria, ...criteria };
  const p = preparePhoto(img);
  return runPipeline(
    eczemaQualityChecks(p, c),
    () => {
      const f = photoFeatures(p);
      const [ery, area] = ECZEMA_MODULE.measurements;
      return {
        measurements: [measurement(ery, f.erythema_index, f._erythema_unc), measurement(area, f.affected_area_pct, f._area_unc)],
        features: Object.fromEntries(ECZEMA_MODULE.feature_names.map((k) => [k, f[k]])),
      };
    },
    `${ECZEMA_MODULE.id}@${ECZEMA_MODULE.version}`,
  );
}
