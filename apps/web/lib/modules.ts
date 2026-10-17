import { ECZEMA_MODULE, TAPPING_MODULE } from "@vf/cv";

/** Built-in CV modules: available on-device (@vf/cv) and in services/cv. */
export const BUILTIN_MODULES = [
  {
    ...ECZEMA_MODULE,
    label: "Skin photo (atopic dermatitis)",
    condition: "eczema",
    summary: "Skin segmentation (YCrCb), CIELAB redness relative to the participant's own unaffected skin, affected-area fraction, colour and texture statistics.",
  },
  {
    ...TAPPING_MODULE,
    label: "Finger tapping (Parkinson's)",
    condition: "parkinsons",
    summary: "MediaPipe hand landmarks per frame → thumb–index distance normalised by hand size → Savitzky–Golay smoothing → tap rate, amplitude, decrement and rhythm.",
  },
];
export type BuiltinModule = (typeof BUILTIN_MODULES)[number];
