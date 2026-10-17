"use client";

import type { Observation } from "@vf/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Accept / correct / reject. Corrections overwrite individual measurement values and require a note. */
export function ReviewActions({ observation }: { observation: Observation }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "correct" | "reject">("idle");
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(decision: "accepted" | "corrected" | "rejected") {
    setError(null);
    start(async () => {
      const corrected = Object.entries(values)
        .filter(([, v]) => v !== "")
        .map(([name, v]) => ({ name, value: Number(v) }));
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: observation.id, decision, note: note || null, corrected }),
      });
      if (!res.ok) return setError((await res.json()).error ?? "Review failed");
      setMode("idle");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => submit("accepted")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            Accept
          </button>
          <button onClick={() => setMode("correct")} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
            Correct…
          </button>
          <button onClick={() => setMode("reject")} className="rounded-lg px-3 py-1.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50">
            Reject…
          </button>
        </div>
      )}
      {mode !== "idle" && (
        <div className="space-y-2 text-sm">
          {mode === "correct" &&
            observation.measurements.map((m) => (
              <label key={m.name} className="flex items-center justify-between gap-2">
                <span className="text-slate-600">{m.label}</span>
                <input
                  type="number"
                  step="any"
                  placeholder={m.value.toFixed(2)}
                  value={values[m.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.name]: e.target.value })}
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right tabular-nums"
                />
              </label>
            ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "reject" ? "Why is this result unusable? (required)" : "What did you correct and why? (required)"}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              disabled={pending || !note.trim()}
              onClick={() => submit(mode === "correct" ? "corrected" : "rejected")}
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save {mode === "correct" ? "correction" : "rejection"}
            </button>
            <button onClick={() => setMode("idle")} className="px-2 text-slate-500 hover:text-ink">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
