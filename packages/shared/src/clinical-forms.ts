import type { ReportQuestion } from "./schemas";

/**
 * Clinically verified patient-reported instruments used as study defaults.
 * Researchers can customise wording/options; citations are kept for provenance.
 *
 * References (public instruments / validated scales):
 * - PDQ-8: Jenkinson et al., Parkinson's Disease Questionnaire short form (HRQoL)
 * - MDS-UPDRS Part I/II patient items & medication ON/OFF state (Goetz et al.)
 * - POEM: Charman et al., Patient-Oriented Eczema Measure (atopic dermatitis)
 * - Itch NRS: validated 0–10 peak pruritus numeric rating scale
 * - ADDS: Arm Dystonia Disability Scale (writing / fine-motor disability items)
 */

export interface ClinicalFormInstrument {
  id: string;
  name: string;
  condition: "parkinsons" | "eczema" | "focal_hand_dystonia" | "other";
  citation: string;
  /** Short note shown to researchers when applying the default */
  summary: string;
  questions: ReportQuestion[];
}

/** PDQ-8 domain proxies + MDS-UPDRS medication state for motor video check-ins. */
export const PD_MOTOR_PRO: ClinicalFormInstrument = {
  id: "pd_motor_pro",
  name: "PD motor check-in (PDQ-8 domains + medication state)",
  condition: "parkinsons",
  citation: "PDQ-8 (Jenkinson et al.); MDS-UPDRS medication ON/OFF state (Goetz et al.)",
  summary: "Medication state plus abbreviated PDQ-8 domains used in remote motor follow-up.",
  questions: [
    {
      key: "medication_state",
      prompt: "Are you ON or OFF your Parkinson's medication right now? (MDS-UPDRS state)",
      type: "choice",
      options: ["ON", "OFF", "Not sure"],
    },
    {
      key: "pdq8_mobility",
      prompt: "Because of Parkinson's, how often have you had difficulty walking? (PDQ-8 mobility)",
      type: "choice",
      options: ["Never", "Occasionally", "Sometimes", "Often", "Always"],
    },
    {
      key: "pdq8_adl",
      prompt: "Because of Parkinson's, how often have you had difficulty with dressing? (PDQ-8 ADLs)",
      type: "choice",
      options: ["Never", "Occasionally", "Sometimes", "Often", "Always"],
    },
    {
      key: "pdq8_stigma",
      prompt: "Because of Parkinson's, how often have you felt self-conscious in public? (PDQ-8 stigma)",
      type: "choice",
      options: ["Never", "Occasionally", "Sometimes", "Often", "Always"],
    },
    {
      key: "symptom_nrs",
      prompt: "Overall, how much have your Parkinson's motor symptoms bothered you today? (0 = not at all, 10 = worst imaginable)",
      type: "scale",
    },
  ],
};

/** POEM (past week) + itch NRS for atopic dermatitis photo check-ins. */
export const AD_POEM_PRO: ClinicalFormInstrument = {
  id: "ad_poem_pro",
  name: "Atopic dermatitis (POEM + itch NRS)",
  condition: "eczema",
  citation: "POEM (Charman et al., BJD); Peak Pruritus NRS (validated itch scale)",
  summary: "POEM weekly symptom items plus 24h itch severity — standard AD PROs.",
  questions: [
    {
      key: "poem_itch",
      prompt: "Over the last week, on how many days has your skin been itchy because of your eczema? (POEM)",
      type: "choice",
      options: ["No days", "1–2 days", "3–4 days", "5–6 days", "Every day"],
    },
    {
      key: "poem_sleep",
      prompt: "Over the last week, on how many nights has your sleep been disturbed because of your eczema? (POEM)",
      type: "choice",
      options: ["No nights", "1–2 nights", "3–4 nights", "5–6 nights", "Every night"],
    },
    {
      key: "poem_bleeding",
      prompt: "Over the last week, on how many days has your skin been bleeding because of your eczema? (POEM)",
      type: "choice",
      options: ["No days", "1–2 days", "3–4 days", "5–6 days", "Every day"],
    },
    {
      key: "poem_weeping",
      prompt: "Over the last week, on how many days has your skin been weeping or oozing because of your eczema? (POEM)",
      type: "choice",
      options: ["No days", "1–2 days", "3–4 days", "5–6 days", "Every day"],
    },
    {
      key: "itch_nrs_24h",
      prompt: "How itchy has your skin been in the last 24 hours? (0 = none, 10 = worst imaginable itch)",
      type: "scale",
    },
    {
      key: "treatment_used",
      prompt: "Did you use your prescribed topical treatment today?",
      type: "choice",
      options: ["Yes", "No", "Not prescribed"],
    },
  ],
};

/** ADDS-inspired writing disability items for focal hand dystonia. */
export const FHD_ADDS_PRO: ClinicalFormInstrument = {
  id: "fhd_adds_pro",
  name: "Focal hand dystonia writing (ADDS-inspired)",
  condition: "focal_hand_dystonia",
  citation: "Arm Dystonia Disability Scale (ADDS) writing / fine-motor items",
  summary: "Writing and fine-motor disability items adapted from ADDS for writer's-cramp follow-up.",
  questions: [
    {
      key: "hand",
      prompt: "Which hand did you write with?",
      type: "choice",
      options: ["Right", "Left"],
    },
    {
      key: "adds_writing",
      prompt: "How much difficulty do you have writing by hand? (ADDS writing)",
      type: "choice",
      options: ["None", "Mild", "Moderate", "Severe", "Unable"],
    },
    {
      key: "adds_handling",
      prompt: "How much difficulty do you have handling small objects (buttons, coins, utensils)? (ADDS)",
      type: "choice",
      options: ["None", "Mild", "Moderate", "Severe", "Unable"],
    },
    {
      key: "dystonia_nrs",
      prompt: "How much did hand dystonia bother your writing today? (0 = not at all, 10 = worst imaginable)",
      type: "scale",
    },
    {
      key: "compensatory",
      prompt: "Did you use a compensatory grip or unusual posture while writing?",
      type: "choice",
      options: ["No", "Yes — mild", "Yes — marked"],
    },
  ],
};

export const CLINICAL_FORMS: ClinicalFormInstrument[] = [PD_MOTOR_PRO, AD_POEM_PRO, FHD_ADDS_PRO];

/** Default clinical form for a study condition. */
export function clinicalFormForCondition(condition: string): ClinicalFormInstrument {
  const key = condition.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (condition === "eczema" || key === "eczema" || key.includes("dermatitis")) return AD_POEM_PRO;
  if (condition === "focal_hand_dystonia" || key.includes("dystonia") || key.includes("writer")) return FHD_ADDS_PRO;
  if (condition === "parkinsons" || key.includes("parkinson")) return PD_MOTOR_PRO;
  return PD_MOTOR_PRO;
}

/** Default clinical form questions for a CV module (task library defaults). */
export function clinicalQuestionsForModule(module: string): ReportQuestion[] {
  if (module === "eczema_photo") return structuredClone(AD_POEM_PRO.questions);
  if (module === "writing_posture" || module.startsWith("gen_")) return structuredClone(FHD_ADDS_PRO.questions);
  // finger_tapping, hand_tremor, and other motor video modules
  return structuredClone(PD_MOTOR_PRO.questions);
}

/**
 * Suggested foundational evaluation module for a study condition.
 * Focal hand dystonia uses a Created (generated) module — callers should pick from approved gen_* ids.
 */
export function defaultModuleForCondition(condition: string): string {
  const key = condition.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (condition === "eczema" || key.includes("dermatitis")) return "eczema_photo";
  if (condition === "focal_hand_dystonia" || key.includes("dystonia") || key.includes("writer")) return "";
  if (condition === "other") return "finger_tapping";
  if (condition === "parkinsons" || key.includes("parkinson")) return "finger_tapping";
  // Custom conditions from Generate — caller should pick a created gen_* module.
  return "";
}
