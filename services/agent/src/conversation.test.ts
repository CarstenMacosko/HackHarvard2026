import { describe, expect, it } from "vitest";
import { FINGER_TAPPING_TASK, type Observation } from "@vf/shared";
import { MAX_ATTEMPTS, handle, type ConvState } from "./conversation";

const obs = (accepted: boolean): Observation => ({
  id: "o1", study_id: "s", participant_id: "p", submission_id: "sub1", module: "finger_tapping",
  task_label: "Right hand", captured_at: "2026-10-17T00:00:00Z", media_url: null,
  quality: { accepted, checks: [], retry_instructions: accepted ? null : "The picture is blurry. Then send it again 🙏" },
  measurements: [], features: {}, model_version: "finger_tapping@0.2.0", patient_report: {}, context: {},
  review_status: "pending", reviewer: null, reviewed_at: null, review_note: null,
});

describe("conversation", () => {
  it("runs fail → retry → accept → report → complete", () => {
    let s: ConvState = { kind: "idle" };
    let r = handle(s, { type: "task_due", task: FINGER_TAPPING_TASK, submissionId: "sub1" });
    expect(r.messages[0]).toContain("finger-tapping");

    r = handle(r.state, { type: "media", url: "blurry.mp4", contentType: "video/mp4" });
    expect(r.effects[0]).toMatchObject({ type: "analyze", attempt: 1 });

    r = handle(r.state, { type: "analysis_result", observation: obs(false) });
    expect(r.messages[0]).toContain("blurry");
    expect(r.state).toMatchObject({ kind: "awaiting_media", attempt: 2 });

    r = handle(r.state, { type: "media", url: "good.mp4", contentType: "video/mp4" });
    r = handle(r.state, { type: "analysis_result", observation: obs(true) });
    expect(r.state.kind).toBe("awaiting_report");

    r = handle(r.state, { type: "text", text: "maybe" });
    expect(r.messages[0]).toContain("didn't catch");
    r = handle(r.state, { type: "text", text: "on" });
    r = handle(r.state, { type: "text", text: "Right" });
    expect(r.state.kind).toBe("idle");
    const done = r.effects[0];
    expect(done.type).toBe("complete");
    if (done.type === "complete") expect(done.observation.patient_report).toEqual({ medication_state: "ON", hand: "Right" });
    s = r.state;
    expect(s.kind).toBe("idle");
  });

  it("escalates after max attempts", () => {
    let state: ConvState = { kind: "analyzing", task: FINGER_TAPPING_TASK, attempt: MAX_ATTEMPTS, submissionId: "sub1" };
    const r = handle(state, { type: "analysis_result", observation: obs(false) });
    expect(r.state.kind).toBe("idle");
    expect(r.effects[0].type).toBe("escalate");
    state = r.state;
  });

  it("ignores POINTS once rewards are removed", () => {
    const r = handle({ kind: "idle" }, { type: "text", text: "points" });
    expect(r.effects).toEqual([]);
    expect(r.messages[0]).toMatch(/next check-in/i);
  });
});
