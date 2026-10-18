import type { Observation, TaskConfig } from "@vf/shared";

/**
 * Pure conversation state machine for one participant. The runtime (index.ts) feeds it
 * events, sends the returned messages and executes the returned effects, then feeds
 * effect results (e.g. CV analysis) back in as events. Keeping it pure makes the
 * fail → retry → accept flow unit-testable without Photon or the CV service.
 */

export const MAX_ATTEMPTS = 3;

export type ConvState =
  | { kind: "idle" }
  | { kind: "awaiting_media"; task: TaskConfig; attempt: number; submissionId: string }
  | { kind: "analyzing"; task: TaskConfig; attempt: number; submissionId: string }
  | {
      kind: "awaiting_report";
      task: TaskConfig;
      submissionId: string;
      attempt: number;
      observation: Observation;
      answers: Record<string, string | number>;
      questionIndex: number;
    };

export type ConvEvent =
  | { type: "task_due"; task: TaskConfig; submissionId: string }
  | { type: "text"; text: string }
  | { type: "media"; url: string; contentType: string }
  | { type: "analysis_result"; observation: Observation }
  | { type: "analysis_error"; error: string };

export type Effect =
  | { type: "analyze"; task: TaskConfig; submissionId: string; mediaUrl: string; attempt: number }
  | { type: "complete"; task: TaskConfig; observation: Observation; attempts: number }
  | { type: "escalate"; task: TaskConfig; submissionId: string; reason: string };

export interface Step {
  state: ConvState;
  messages: string[];
  effects: Effect[];
}

const step = (state: ConvState, messages: string[] = [], effects: Effect[] = []): Step => ({ state, messages, effects });

function questionText(task: TaskConfig, i: number): string {
  const q = task.report_questions[i];
  const opts = q.options?.length ? ` (${q.options.join(" / ")})` : q.type === "scale" ? " (0–10)" : "";
  return `${q.prompt}${opts}`;
}

function parseAnswer(task: TaskConfig, i: number, text: string): string | number | null {
  const q = task.report_questions[i];
  const t = text.trim();
  if (q.type === "scale") {
    const n = Number(t.match(/\d+(\.\d+)?/)?.[0]);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
  }
  if (q.type === "choice" && q.options) {
    const hit = q.options.find((o) => o.toLowerCase() === t.toLowerCase() || t.toLowerCase().startsWith(o.toLowerCase()));
    return hit ?? null;
  }
  return t || null;
}

export function handle(state: ConvState, event: ConvEvent): Step {
  switch (state.kind) {
    case "idle":
      if (event.type === "task_due") {
        return step(
          { kind: "awaiting_media", task: event.task, attempt: 1, submissionId: event.submissionId },
          [event.task.instructions],
        );
      }
      if (event.type === "media") {
        return step(state, ["Thanks! There's no check-in due right now. I'll message you when the next one is ready."]);
      }
      return step(state, ["Hi! I'll text you when your next check-in is due."]);

    case "awaiting_media":
      if (event.type === "media") {
        return step({ ...state, kind: "analyzing" }, ["Got it, checking that now…"], [
          { type: "analyze", task: state.task, submissionId: state.submissionId, mediaUrl: event.url, attempt: state.attempt },
        ]);
      }
      if (event.type === "text") {
        if (/^help\b/i.test(event.text.trim())) return step(state, [state.task.instructions]);
        return step(state, [`Whenever you're ready, send the ${state.task.media_type} here. Reply HELP to see the instructions again.`]);
      }
      return step(state);

    case "analyzing":
      if (event.type === "analysis_result") {
        const obs = event.observation;
        if (!obs.quality.accepted) {
          if (state.attempt >= MAX_ATTEMPTS) {
            return step({ kind: "idle" }, [
              "Thanks for trying. That one is tricky! Your study coordinator will reach out to help.",
            ], [{ type: "escalate", task: state.task, submissionId: state.submissionId, reason: obs.quality.retry_instructions ?? "quality" }]);
          }
          return step(
            { kind: "awaiting_media", task: state.task, attempt: state.attempt + 1, submissionId: state.submissionId },
            [obs.quality.retry_instructions ?? "That didn't come through clearly. Could you try once more?"],
          );
        }
        if (state.task.report_questions.length === 0) {
          return step({ kind: "idle" }, ["Perfect, that's a usable capture ✅"], [
            { type: "complete", task: state.task, observation: obs, attempts: state.attempt },
          ]);
        }
        return step(
          { kind: "awaiting_report", task: state.task, submissionId: state.submissionId, attempt: state.attempt, observation: obs, answers: {}, questionIndex: 0 },
          ["Perfect, that's a usable capture ✅ Two quick questions:", questionText(state.task, 0)],
        );
      }
      if (event.type === "analysis_error") {
        return step({ ...state, kind: "awaiting_media" }, ["Sorry, I had trouble processing that. Could you send it again?"]);
      }
      return step(state, ["One moment, still checking your last one…"]);

    case "awaiting_report": {
      if (event.type !== "text") return step(state, ["Just a quick answer to the question above, please 🙂"]);
      const answer = parseAnswer(state.task, state.questionIndex, event.text);
      if (answer === null) return step(state, [`Sorry, I didn't catch that. ${questionText(state.task, state.questionIndex)}`]);
      const q = state.task.report_questions[state.questionIndex];
      const answers = { ...state.answers, [q.key]: answer };
      const next = state.questionIndex + 1;
      if (next < state.task.report_questions.length) {
        return step({ ...state, answers, questionIndex: next }, [questionText(state.task, next)]);
      }
      const observation: Observation = { ...state.observation, patient_report: { ...state.observation.patient_report, ...answers } };
      return step({ kind: "idle" }, ["Thank you, all done for this check-in!"], [
        { type: "complete", task: state.task, observation, attempts: state.attempt },
      ]);
    }
  }
}
