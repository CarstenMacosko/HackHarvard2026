import { pct } from "@/lib/format";

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
export function FunnelBars({ funnel: f }: { funnel: Funnel }) {
  const rows = [
    { label: "All capture attempts", n: f.attempts, color: "#94a3b8" },
    { label: "Usable on first try", n: f.firstTry, color: "#0f8a5f" },
    { label: "Usable after a guided retry", n: f.afterRetry, color: "#2a78d6" },
    { label: "Unusable (retry requested)", n: f.unusable, color: "#c98500" },
  ];
  const max = Math.max(1, f.attempts);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-600">{r.label}</span>
            <span className="tabular font-medium text-slate-900">
              {r.n} <span className="font-normal text-slate-400">{pct(r.n / max)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
