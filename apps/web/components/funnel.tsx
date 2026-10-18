import { pct } from "@/lib/format";
import { cn } from "./ui";

interface Funnel {
  attempts: number;
  accepted: number;
  firstTry: number;
  afterRetry: number;
  unusable: number;
  escalated: number;
  onDevice: number;
}

/** Horizontal bars, each labelled with its count and share of all attempts. */
export function FunnelBars({ funnel: f, className }: { funnel: Funnel; className?: string }) {
  const rows = [
    { label: "All capture attempts", n: f.attempts, color: "#a6a39f" },
    { label: "Usable on first try", n: f.firstTry, color: "#0f8a5f" },
    { label: "Usable after a guided retry", n: f.afterRetry, color: "#4f7cac" },
    { label: "Unusable (retry requested)", n: f.unusable, color: "#c98500" },
  ];
  const max = Math.max(1, f.attempts);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400">{r.label}</span>
            <span className="tabular font-medium text-slate-900 dark:text-slate-100">
              {r.n} <span className="font-normal text-slate-400">{pct(r.n / max)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-2 rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
