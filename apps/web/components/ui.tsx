import type { ValidationStatus } from "@vf/shared";
import Link from "next/link";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const bg = /\bbg-/.test(className) ? "" : "bg-white";
  return <div className={`rounded-xl border border-slate-200 ${bg} p-5 shadow-sm ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export const REVIEW_TONE: Record<string, Tone> = { pending: "amber", accepted: "green", corrected: "blue", rejected: "red" };
export const STATUS_TONE: Record<string, Tone> = { active: "green", invited: "blue", paused: "amber", withdrawn: "red", completed: "slate" };

const VALIDATION: Record<ValidationStatus, { label: string; tone: Tone }> = {
  validated: { label: "Validated for this use", tone: "green" },
  reusable_needs_validation: { label: "Reusable · needs validation", tone: "amber" },
  new_model_required: { label: "Needs new model", tone: "violet" },
};

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const v = VALIDATION[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const cls =
    variant === "primary"
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50";
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium ${cls}`}>
      {children}
    </Link>
  );
}

export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
