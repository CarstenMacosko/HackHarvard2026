import { factoryApiKey, resolveDroidExecPath } from "./live-keys";

export type MeasurementDraft = { name: string; label: string; unit: string };

export type PlanVerdict = "feasible" | "needs_revision" | "impossible";

export type MeasurementAdvice = {
  name: string;
  verdict: PlanVerdict;
  advice: string;
  /** Optional rewrite the agent proposes when the draft is not usable as-stated. */
  suggested?: MeasurementDraft;
};

export type DesignMessage = {
  role: "researcher" | "droid";
  text: string;
  at: string;
};

export type AssessPlanInput = {
  condition: string;
  description: string;
  measurements: MeasurementDraft[];
  /** Free-form notes / reply to prior advice. */
  message?: string;
  history?: DesignMessage[];
};

export type AssessPlanResult = {
  mode: "live" | "demo";
  verdict: PlanVerdict;
  summary: string;
  advice: string;
  measurements: MeasurementAdvice[];
  /** Plan is ready to accept when verdict === "feasible". */
  can_accept: boolean;
  revised_measurements?: MeasurementDraft[];
};

const KNOWN_WRITING: Record<string, { label: string; unit: string; advice: string }> = {
  index_straight_fraction: {
    label: "Index finger straight during writing",
    unit: "fraction",
    advice: "Supported: share of writing frames where index PIP ≥ 160° (MediaPipe landmarks 5–6–7).",
  },
  index_pip_angle_deg: {
    label: "Mean index PIP angle during writing",
    unit: "degrees",
    advice: "Supported: mean interior angle at index PIP during the writing segment.",
  },
};

const IMPOSSIBLE =
  /blood|pressure|emg|force|torque|mri|ct\b|x-?ray|lab\b|biomarker|dna|genome|weight|bmi|grip\s*strength|newton|pain\s*score|updrs|questionnaire|survey/i;

const LANDMARK_HINT =
  /index|pip|dip|mcp|finger|thumb|wrist|hand|landmark|angle|straight|writing|pen|posture|tremor|tap|amplitude|speed|velocity|jerk|flexion|extension/i;

function slugifyName(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "custom_metric"
  );
}

function assessOne(m: MeasurementDraft, description: string): MeasurementAdvice {
  const known = KNOWN_WRITING[m.name];
  if (known) {
    return { name: m.name, verdict: "feasible", advice: known.advice };
  }

  const blob = `${m.name} ${m.label} ${m.unit} ${description}`;
  if (IMPOSSIBLE.test(blob)) {
    return {
      name: m.name,
      verdict: "impossible",
      advice: `"${m.label}" needs a signal we cannot get from a phone video (e.g. force, labs, or clinical scales). Prefer a landmark-based proxy such as index straightness or PIP angle.`,
      suggested: {
        name: "index_straight_fraction",
        label: KNOWN_WRITING.index_straight_fraction.label,
        unit: KNOWN_WRITING.index_straight_fraction.unit,
      },
    };
  }

  if (LANDMARK_HINT.test(blob)) {
    return {
      name: m.name,
      verdict: "feasible",
      advice: `"${m.label}" looks computable from MediaPipe hand landmarks in a writing/hand video. Droid will draft an extractor; Daytona will AST-check and tune hold/straightness params on synthetic tracks. Confirm camera view (side/writing hand) in the task description.`,
    };
  }

  return {
    name: m.name,
    verdict: "needs_revision",
    advice: `Unclear how to measure "${m.label}" from video alone. Tell Droid which visible cue to use (e.g. index PIP angle, fingertip distance, writing speed from landmarks), or add one of the known writing metrics.`,
    suggested: {
      name: "index_pip_angle_deg",
      label: KNOWN_WRITING.index_pip_angle_deg.label,
      unit: KNOWN_WRITING.index_pip_angle_deg.unit,
    },
  };
}

/** Deterministic demo assessor — used when FACTORY_API_KEY is unset, and as a safety net. */
export function assessPlanDemo(input: AssessPlanInput): AssessPlanResult {
  if (!input.measurements.length) {
    return {
      mode: "demo",
      verdict: "needs_revision",
      summary: "Add at least one measurement for Droid to assess.",
      advice: "Start from the suggested writing metrics, or describe a new landmark-based measurement.",
      measurements: [],
      can_accept: false,
    };
  }

  const per = input.measurements.map((m) => assessOne(m, input.description));
  const anyImpossible = per.some((p) => p.verdict === "impossible");
  const anyRevise = per.some((p) => p.verdict === "needs_revision");
  const verdict: PlanVerdict = anyImpossible ? "impossible" : anyRevise ? "needs_revision" : "feasible";

  const replyBits = per.map((p) => `• ${p.name}: ${p.advice}`);
  if (input.message?.trim()) {
    replyBits.unshift(
      `Noted your note: “${input.message.trim().slice(0, 200)}”. Re-checked the plan against what a phone video + hand landmarks can support.`,
    );
  }

  const revised =
    verdict !== "feasible"
      ? input.measurements.map((m, i) => {
          const a = per[i];
          return a.suggested && a.verdict !== "feasible" ? a.suggested : m;
        })
      : undefined;

  const summary =
    verdict === "feasible"
      ? "This plan looks feasible with the current hand-landmark stack. Accept it to unlock Generate, or keep iterating."
      : verdict === "impossible"
        ? "At least one measurement cannot be derived from phone video. Revise those items (suggestions below), then ask Droid again."
        : "Some measurements need a clearer video/landmark definition. Reply with more detail or apply the suggested rewrites, then re-assess.";

  return {
    mode: "demo",
    verdict,
    summary,
    advice: [summary, ...replyBits].join("\n"),
    measurements: per,
    can_accept: verdict === "feasible",
    revised_measurements: revised,
  };
}

/** Live Droid assessment when configured; falls back to demo heuristics. */
export async function assessMeasurementPlan(input: AssessPlanInput): Promise<AssessPlanResult> {
  const demo = assessPlanDemo(input);
  const apiKey = factoryApiKey();
  if (!apiKey) return demo;

  try {
    const { run } = await import("@factory/droid-sdk/node");
    const history = (input.history ?? [])
      .slice(-8)
      .map((m) => `${m.role}: ${m.text}`)
      .join("\n");
    const prompt = `You are Droid assessing whether a clinical video CV measurement plan is feasible for the Visual Follow-Up platform.

Platform capabilities:
- Phone photo/video only
- MediaPipe hand landmarks (21 points), writing hold→write protocol, tremor spectrum, finger tapping
- Cannot measure force, EMG, labs, MRI, questionnaires, or anything not visible in the frame

Researcher plan:
- condition: ${input.condition}
- description: ${input.description}
- measurements: ${JSON.stringify(input.measurements)}
- latest note: ${input.message ?? "(none)"}
- prior thread:
${history || "(none)"}

Return ONLY JSON (no markdown) with shape:
{
  "verdict": "feasible" | "needs_revision" | "impossible",
  "summary": "one short paragraph",
  "advice": "multi-line advice the researcher can reply to",
  "measurements": [{"name":"...","verdict":"feasible|needs_revision|impossible","advice":"...","suggested":{"name":"...","label":"...","unit":"..."}?}],
  "revised_measurements": [{"name":"...","label":"...","unit":"..."}]?
}`;

    const result = await run(prompt, {
      apiKey,
      execPath: resolveDroidExecPath(),
      cwd: process.cwd(),
      env: { ...process.env, FACTORY_API_KEY: apiKey },
      autoRejectPermissionRequests: true,
    });
    const text = (result.text ?? "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ...demo, mode: "live", advice: `${demo.advice}\n\n(Live Droid returned no JSON; used heuristic assessor.)` };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AssessPlanResult>;
    const verdict = (parsed.verdict as PlanVerdict) || demo.verdict;
    return {
      mode: "live",
      verdict,
      summary: parsed.summary || demo.summary,
      advice: parsed.advice || demo.advice,
      measurements: Array.isArray(parsed.measurements) && parsed.measurements.length ? (parsed.measurements as MeasurementAdvice[]) : demo.measurements,
      can_accept: verdict === "feasible",
      revised_measurements: parsed.revised_measurements ?? demo.revised_measurements,
    };
  } catch {
    return { ...demo, mode: "live", advice: `${demo.advice}\n\n(Live Droid call failed; used heuristic assessor.)` };
  }
}

export function suggestCustomDraft(label: string, unit = "fraction"): MeasurementDraft {
  return { name: slugifyName(label), label: label.trim() || "Custom measurement", unit: unit.trim() || "fraction" };
}
