import type { ReportQuestion } from "@vf/shared";

/** Validate a participant's answers against the task's report questions; returns an error or null. */
export function validateReport(questions: ReportQuestion[], report: Record<string, unknown>): string | null {
  for (const q of questions) {
    const v = report[q.key];
    if (v === undefined || v === null || v === "") return `Please answer: ${q.prompt}`;
    if (q.type === "scale" && !(typeof v === "number" && v >= 0 && v <= 10)) return `${q.prompt}: choose a number from 0 to 10.`;
    if (q.type === "choice" && q.options && !q.options.includes(String(v))) return `${q.prompt}: choose one of ${q.options.join(", ")}.`;
  }
  return null;
}
