import type { TaskConfig, ValidationStatus } from "./schemas";

/**
 * Reusable CV components the workflow builder can compose. Mirrors the registry exposed by
 * the CV service at GET /modules (services/cv/app/registry.py) so the web app works offline.
 */
export interface CvComponent {
  id: string;
  kind: "quality_check" | "extractor" | "measurement";
  label: string;
  media: ("photo" | "video")[];
  description: string;
  /** conditions this component has been validated for in a study context */
  validated_for: string[];
}

export const CV_COMPONENTS: CvComponent[] = [
  { id: "blur", kind: "quality_check", label: "Blur (Laplacian variance)", media: ["photo", "video"], description: "Rejects out-of-focus or shaky captures.", validated_for: ["*"] },
  { id: "exposure", kind: "quality_check", label: "Exposure", media: ["photo", "video"], description: "Rejects too dark or blown-out captures.", validated_for: ["*"] },
  { id: "hand_visible", kind: "quality_check", label: "Hand visible", media: ["video"], description: "MediaPipe hand detected in most frames.", validated_for: ["parkinsons"] },
  { id: "duration", kind: "quality_check", label: "Duration / frame rate", media: ["video"], description: "Video long enough and at a usable fps.", validated_for: ["*"] },
  { id: "skin_coverage", kind: "quality_check", label: "Skin fills frame", media: ["photo"], description: "Enough skin pixels to analyze the region.", validated_for: ["eczema"] },
  { id: "hand_landmarks", kind: "extractor", label: "Hand landmarks (MediaPipe)", media: ["video"], description: "21 hand keypoints per frame.", validated_for: ["parkinsons"] },
  { id: "pose_landmarks", kind: "extractor", label: "Body pose (MediaPipe)", media: ["video"], description: "33 body keypoints per frame (gait, tremor, posture).", validated_for: [] },
  { id: "skin_mask", kind: "extractor", label: "Skin segmentation", media: ["photo"], description: "Separates skin from background.", validated_for: ["eczema"] },
  { id: "tap_kinematics", kind: "measurement", label: "Finger-tap kinematics", media: ["video"], description: "Tap rate, amplitude, decrement, rhythm variability.", validated_for: ["parkinsons"] },
  { id: "erythema_index", kind: "measurement", label: "Erythema index", media: ["photo"], description: "Redness within skin (CIELAB a*).", validated_for: ["eczema"] },
  { id: "lesion_area", kind: "measurement", label: "Affected area fraction", media: ["photo"], description: "Share of visible skin with elevated redness.", validated_for: ["eczema"] },
  { id: "color_texture_features", kind: "extractor", label: "Skin colour & texture features", media: ["photo"], description: "16-value feature vector (CIELAB statistics, redness bands, texture) that researcher-trained models read.", validated_for: [] },
  { id: "tremor_spectrum", kind: "measurement", label: "Tremor spectrum", media: ["video"], description: "Dominant 3–12 Hz frequency, peak-to-peak amplitude and tremor share of hand movement (Welch spectrum of hand landmarks).", validated_for: [] },
  { id: "image_embedding", kind: "extractor", label: "Image embedding (MobileNet-V3)", media: ["photo"], description: "1,024-value general-purpose embedding, on-device and on the server; trained heads (e.g. SCIN condition likelihoods) read it.", validated_for: [] },
  { id: "tap_features", kind: "extractor", label: "Tapping kinematics features", media: ["video"], description: "10-value feature vector (rate, amplitude, fatigue, rhythm) that researcher-trained models read.", validated_for: [] },
];

export function validationStatusFor(componentId: string, condition: string): ValidationStatus {
  const c = CV_COMPONENTS.find((x) => x.id === componentId);
  if (!c) return "new_model_required";
  if (c.validated_for.includes("*") || c.validated_for.includes(condition)) return "validated";
  return "reusable_needs_validation";
}

export const FINGER_TAPPING_TASK: TaskConfig = {
  id: "pd_finger_tap_right",
  module: "finger_tapping",
  label: "Finger tapping: right hand",
  media_type: "video",
  cadence: "weekly",
  instructions:
    "Time for your weekly finger-tapping check 👋 Prop your phone up so your whole right hand is in view, then tap your index finger and thumb together as fast and as wide as you can for 10 seconds. Send the video here.",
  quality_criteria: { blur: 20, exposure_min: 60, exposure_max: 220, hand_visible: 0.8, duration_s: 8, fps: 20 },
  report_questions: [
    { key: "medication_state", prompt: "Are you ON or OFF your medication right now?", type: "choice", options: ["ON", "OFF", "Not sure"] },
    { key: "hand", prompt: "Which hand did you tap with?", type: "choice", options: ["Right", "Left"] },
  ],
  measurements: [
    { name: "tap_rate_hz", label: "Tap rate", unit: "Hz", validation_status: "reusable_needs_validation" },
    { name: "amplitude_norm", label: "Amplitude", unit: "× hand size", validation_status: "reusable_needs_validation" },
    { name: "amplitude_decrement", label: "Amplitude decrement", unit: "%", validation_status: "reusable_needs_validation" },
    { name: "rhythm_cv", label: "Rhythm variability", unit: "CV", validation_status: "reusable_needs_validation" },
  ],
};

export const TREMOR_TASK: TaskConfig = {
  id: "pd_rest_tremor_right",
  module: "hand_tremor",
  label: "Rest tremor: right hand",
  media_type: "video",
  cadence: "weekly",
  instructions:
    "Weekly tremor check 🤚 Prop your phone up so it can't move, rest your right forearm on a table with your hand relaxed and in view (wrist included), and keep it still for 15 seconds. Send the video here.",
  quality_criteria: { blur: 20, exposure_min: 60, exposure_max: 220, hand_visible: 0.8, duration_s: 8, fps: 24 },
  report_questions: [
    { key: "medication_state", prompt: "Are you ON or OFF your medication right now?", type: "choice", options: ["ON", "OFF", "Not sure"] },
    { key: "tremor_today", prompt: "How much has tremor bothered you today, 0 (not at all) to 10 (very much)?", type: "scale" },
  ],
  measurements: [
    { name: "tremor_amplitude", label: "Tremor amplitude", unit: "× hand size", validation_status: "reusable_needs_validation" },
    { name: "tremor_freq_hz", label: "Tremor frequency", unit: "Hz", validation_status: "reusable_needs_validation" },
    { name: "tremor_power_ratio", label: "Tremor share of movement", unit: "fraction", validation_status: "reusable_needs_validation" },
  ],
};

export const ECZEMA_TASK: TaskConfig = {
  id: "ad_photo_left_elbow",
  module: "eczema_photo",
  label: "Skin photo: left inner elbow",
  media_type: "photo",
  cadence: "twice_weekly",
  instructions:
    "Skin check time 📸 Stand near a window (no flash), hold your phone about 30 cm (one forearm) from your left inner elbow, and take a straight-on photo with the whole patch in frame.",
  quality_criteria: { blur: 15, exposure_min: 70, exposure_max: 210, skin_coverage: 0.25 },
  report_questions: [
    { key: "itch", prompt: "How itchy has it been in the last 24h, 0 (none) to 10 (worst)?", type: "scale" },
    { key: "treatment_used", prompt: "Did you use your treatment today?", type: "choice", options: ["Yes", "No"] },
  ],
  measurements: [
    { name: "erythema_index", label: "Erythema index", unit: "Δa*", validation_status: "reusable_needs_validation" },
    { name: "affected_area_pct", label: "Affected area", unit: "% of skin", validation_status: "reusable_needs_validation" },
  ],
};
