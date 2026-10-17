import { SCORE_NAME, SCORE_WORDS, type Measurement } from "@vf/shared";
import { cn } from "./ui";

/** The rule-based severity score of a capture (packages/shared/src/scores.ts), if it has one. */
export const scoreOf = (o: { measurements: Measurement[] }) => o.measurements.find((m) => m.name === SCORE_NAME)?.value ?? null;

const TONE = ["bg-emerald-100 text-emerald-800 ring-emerald-200", "bg-lime-100 text-lime-800 ring-lime-200", "bg-amber-100 text-amber-800 ring-amber-200", "bg-orange-100 text-orange-800 ring-orange-200", "bg-rose-100 text-rose-800 ring-rose-200"];

export function ScoreBadge({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-slate-400">–</span>;
  const v = Math.round(value);
  return (
    <span className={cn("tabular inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset", TONE[v], className)} title={`Severity ${v}/4 (${SCORE_WORDS[v]}), rule-based, needs validation`}>
      {v}
      <span className="font-normal opacity-75">/4</span>
    </span>
  );
}

/** Headline card: the score, what drove it, and that it isn't validated yet. */
export function ScoreCard({ o }: { o: { measurements: Measurement[]; context: Record<string, string | number | boolean> } }) {
  const v = scoreOf(o);
  if (v === null) return null;
  const r = Math.round(v);
  return (
    <div className={cn("flex items-center gap-4 rounded-lg px-4 py-3 ring-1 ring-inset", TONE[r])} data-testid="severity-score">
      <div className="tabular text-3xl font-semibold leading-none">
        {r}
        <span className="text-base font-normal opacity-60">/4</span>
      </div>
      <div className="min-w-0 text-sm">
        <div className="font-semibold capitalize">{SCORE_WORDS[r]}</div>
        <div className="text-xs opacity-80">
          {o.context.score_basis ? `Driven by ${String(o.context.score_basis).toLowerCase()}. ` : ""}
          {o.context.score_components ? `Components: ${o.context.score_components}. ` : ""}Rule-based severity score, not yet validated.
        </div>
      </div>
    </div>
  );
}
