import { ECZEMA_MODULE, TAPPING_MODULE, TREMOR_MODULE } from "@vf/cv";

/** Built-in CV modules: available on-device (@vf/cv) and/or in services/cv — one module per clinical condition task. */
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
  {
    ...TREMOR_MODULE,
    label: "Hand tremor (rest / postural, Parkinson's)",
    condition: "parkinsons",
    summary: "MediaPipe hand landmarks per frame → hand-centre and fingertip motion in hand-size units → Welch spectrum → dominant 3–12 Hz frequency, peak-to-peak amplitude and tremor share of movement.",
  },
  {
    id: "writing_posture",
    version: "0.1.0",
    media_type: "video" as const,
    label: "Writing posture (focal hand dystonia)",
    condition: "focal_hand_dystonia",
    summary: "MediaPipe hand landmarks → index PIP angle during hold and writing → fraction of writing frames with a straightened index finger (server-side WritingPostureModule).",
    measurements: [
      { name: "index_straight_fraction", label: "Index finger straight during writing", unit: "fraction" },
      { name: "index_pip_angle_deg", label: "Mean index PIP angle during writing", unit: "degrees" },
    ],
    default_criteria: { blur: 20, exposure_min: 60, exposure_max: 220, hand_visible: 0.8, duration_s: 6, fps: 20 },
  },
];
export type BuiltinModule = (typeof BUILTIN_MODULES)[number];
