import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { CV_COMPONENTS, validationStatusFor, type TaskConfig, type WorkflowDraft } from "@vf/shared";

/**
 * Workflow builder: clinician describes a new condition → draft protocol task(s).
 * The LLM only drafts wording and picks catalog components; validation status is decided
 * deterministically from the component catalog, never by the model.
 */

const LlmDraft = z.object({
  condition: z.string().describe("Condition name, e.g. 'Plaque psoriasis'"),
  condition_slug: z.string().describe("lowercase id, e.g. 'psoriasis'"),
  summary: z.string().describe("2-3 sentences for the clinician: what is tracked and why"),
  tasks: z.array(
    z.object({
      label: z.string(),
      media_type: z.enum(["photo", "video"]),
      cadence: z.enum(["daily", "twice_weekly", "weekly", "biweekly"]),
      instructions: z.string().describe("Friendly text message to the patient, under 320 characters"),
      quality_checks: z.array(z.object({ component_id: z.string(), threshold: z.number() })),
      report_questions: z.array(
        z.object({ key: z.string(), prompt: z.string(), type: z.enum(["scale", "choice", "text"]), options: z.array(z.string()) }),
      ),
      measurements: z.array(
        z.object({
          name: z.string().describe("snake_case"),
          label: z.string(),
          unit: z.string(),
          component_id: z.string().nullable().describe("catalog measurement component id, or null if no existing component can produce it"),
        }),
      ),
    }),
  ),
  validation_plan: z.array(z.string()).describe("Concrete steps: labeled data needed, expert comparison, subgroups (skin tone, device, lighting)"),
});
type LlmDraft = z.infer<typeof LlmDraft>;

const SYSTEM = `You help clinical study teams configure at-home visual follow-up workflows. Patients receive instructions by text message and reply with a photo or short video; a computer-vision pipeline checks quality and extracts measurements; clinicians review every result.

Draft a workflow for the condition the clinician describes. Reuse components from this catalog wherever they genuinely fit, and set component_id to null for any measurement no catalog component can produce. Do not stretch a component to cover something it does not measure.

Catalog:
${JSON.stringify(CV_COMPONENTS.map(({ id, kind, label, media, description }) => ({ id, kind, label, media, description })), null, 1)}

Quality-check thresholds use these conventions: blur = minimum Laplacian variance (60-100 typical), exposure = mean brightness ceiling (~200), skin_coverage / hand_visible = minimum fraction (0-1), duration = minimum seconds.`;

/** Which built-in module produces each catalog measurement component. */
const MODULE_FOR_COMPONENT: Record<string, { module: string; media: "photo" | "video" }> = {
  erythema_index: { module: "eczema_photo", media: "photo" },
  lesion_area: { module: "eczema_photo", media: "photo" },
  tap_kinematics: { module: "finger_tapping", media: "video" },
  tremor_spectrum: { module: "hand_tremor", media: "video" },
};

function toDraft(d: LlmDraft, source: WorkflowDraft["source"]): WorkflowDraft {
  const tasks: TaskConfig[] = d.tasks.map((t, i) => {
    // reuse a built-in module only if it produces every measurement; otherwise a new module is needed
    const owners = new Set(t.measurements.map((m) => (m.component_id ? MODULE_FOR_COMPONENT[m.component_id] : undefined)).map((o) => (o && o.media === t.media_type ? o.module : null)));
    const existingModule = owners.size === 1 && !owners.has(null) ? [...owners][0] : null;
    return {
      id: `${d.condition_slug}_${i + 1}`,
      module: existingModule ?? `draft_${d.condition_slug}`,
      label: t.label,
      media_type: t.media_type,
      cadence: t.cadence,
      instructions: t.instructions,
      quality_criteria: Object.fromEntries(t.quality_checks.map((q) => [q.component_id, q.threshold])),
      report_questions: t.report_questions.map((q) => ({ ...q, options: q.options.length ? q.options : undefined })),
      measurements: t.measurements.map((m) => ({
        name: m.name,
        label: m.label,
        unit: m.unit,
        validation_status: m.component_id ? validationStatusFor(m.component_id, d.condition_slug) : "new_model_required",
      })),
    };
  });
  return { condition: d.condition, summary: d.summary, tasks, validation_plan: d.validation_plan, source };
}

export async function draftWorkflow(prompt: string): Promise<WorkflowDraft> {
  if (!process.env.ANTHROPIC_API_KEY) return templateDraft(prompt);
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(LlmDraft) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return templateDraft(prompt);
    return toDraft(res.parsed_output, "claude");
  } catch (err) {
    console.error("builder: Claude call failed, using template", err);
    return templateDraft(prompt);
  }
}

/** Offline fallback: keyword heuristics over the same catalog, so the demo works without an API key. */
export function templateDraft(prompt: string): WorkflowDraft {
  const p = prompt.toLowerCase();
  const has = (...words: string[]) => words.some((w) => p.includes(w));
  const video = has("tremor", "gait", "walk", "movement", "tap", "speech", "motor");
  const slug = (p.match(/^\s*([a-z][a-z' -]{2,30}?)[:.,\n]/)?.[1] ?? "new condition").trim().replace(/[^a-z]+/g, "_");
  const condition = slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const measurements: LlmDraft["tasks"][number]["measurements"] = [];
  if (has("red", "erythema", "inflam")) measurements.push({ name: "erythema_index", label: "Erythema index", unit: "Δa*", component_id: "erythema_index" });
  if (has("area", "extent", "plaque", "patch", "lesion", "spread")) measurements.push({ name: "affected_area_pct", label: "Affected area", unit: "% of skin", component_id: "lesion_area" });
  if (has("scal", "thick", "texture", "flak")) measurements.push({ name: "scaling_score", label: "Scaling", unit: "0–4", component_id: null });
  if (has("tremor")) measurements.push({ name: "tremor_amplitude", label: "Tremor amplitude", unit: "× hand size", component_id: "tremor_spectrum" });
  if (has("gait", "walk")) measurements.push({ name: "stride_time_cv", label: "Stride time variability", unit: "CV", component_id: null });
  if (!measurements.length) measurements.push({ name: "primary_visual_score", label: "Primary visual score", unit: "a.u.", component_id: null });

  return toDraft(
    {
      condition,
      condition_slug: slug,
      summary: `Draft generated offline from keywords. Tracks ${measurements.map((m) => m.label.toLowerCase()).join(", ")} via patient-submitted ${video ? "videos" : "photos"}. Set ANTHROPIC_API_KEY for a tailored draft.`,
      tasks: [
        {
          label: `${condition}: ${video ? "movement video" : "affected area photo"}`,
          media_type: video ? "video" : "photo",
          cadence: "weekly",
          instructions: video
            ? "Time for your weekly check 🎥 Prop your phone up in good light so your whole body part is in view, then record 15 seconds following the steps your coordinator showed you."
            : "Weekly skin check 📸 Stand near a window (no flash), hold your phone one forearm's length from the affected area, and take a straight-on photo with the whole area in frame.",
          quality_checks: video
            ? [{ component_id: "blur", threshold: 60 }, { component_id: "exposure", threshold: 200 }, { component_id: "duration", threshold: 12 }]
            : [{ component_id: "blur", threshold: 15 }, { component_id: "exposure", threshold: 210 }, { component_id: "skin_coverage", threshold: 0.25 }],
          report_questions: [{ key: "symptom_severity", prompt: "How bad were your symptoms in the last 24h, 0 (none) to 10 (worst)?", type: "scale", options: [] }],
          measurements,
        },
      ],
      validation_plan: [
        "Collect ≥150 labeled captures scored by two blinded clinicians to set inter-rater agreement.",
        "Compare each reusable component's output to clinician scores (ICC / Bland–Altman) before activating it for this condition.",
        "Stratify performance by skin tone (Fitzpatrick I–VI), device and lighting; report the worst subgroup, not just the mean.",
        "Train and evaluate new models only for measurements marked 'needs new model', with a held-out site.",
      ],
    },
    "template",
  );
}
