"use client";

import type { Observation } from "@vf/shared";
import { Check, PencilLine, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "./ui";

/** Accept / correct / reject. Corrections overwrite individual measurement values and require a note. */
export function ReviewActions({ observation, nextHref }: { observation: Observation; nextHref?: string }) {
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
      setNote("");
      setValues({});
      if (nextHref) router.push(nextHref);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/60">
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="success" size="sm" disabled={pending} onClick={() => submit("accepted")}>
            <Check className="h-3.5 w-3.5" /> Accept
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMode("correct")}>
            <PencilLine className="h-3.5 w-3.5" /> Correct
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMode("reject")}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      )}
      {mode !== "idle" && (
        <div className="space-y-2 text-sm">
          {mode === "correct" &&
            observation.measurements.map((m) => (
              <label key={m.name} className="flex items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-400">
                  {m.label} <span className="text-slate-400">({m.unit})</span>
                </span>
                <input
                  type="number"
                  step="any"
                  placeholder={m.value.toFixed(2)}
                  value={values[m.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.name]: e.target.value })}
                  className="tabular w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "reject" ? "Why is this result unusable? (required)" : "What did you correct and why? (required)"}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !note.trim()} onClick={() => submit(mode === "correct" ? "corrected" : "rejected")}>
              Save {mode === "correct" ? "correction" : "rejection"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
