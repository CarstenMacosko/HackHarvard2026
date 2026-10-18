import type { ValidationStatus } from "@vf/shared";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

// ---------- layout ----------

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                {b.href ? (
                  <Link href={b.href} className="hover:text-slate-900 dark:hover:text-slate-100">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</div>;
}

// ---------- data display ----------

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={cn(
          "tabular mt-1 text-2xl font-semibold tracking-tight",
          tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-400/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-400/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-400/20",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export const REVIEW_TONE: Record<string, Tone> = { pending: "amber", accepted: "green", corrected: "blue", rejected: "red" };
export const STATUS_TONE: Record<string, Tone> = { active: "green", invited: "blue", paused: "amber", withdrawn: "red", completed: "slate" };

const VALIDATION: Record<ValidationStatus, { label: string; tone: Tone }> = {
  validated: { label: "Validated", tone: "green" },
  reusable_needs_validation: { label: "Needs validation", tone: "amber" },
  new_model_required: { label: "Needs new model", tone: "violet" },
};

export function ValidationBadge({ status }: { status: ValidationStatus }) {
  if (status === "reusable_needs_validation") return null;
  const v = VALIDATION[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function ProgressBar({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "white" }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full", tone === "white" ? "bg-white/25" : "bg-slate-100 dark:bg-slate-800", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone === "white" ? "bg-white" : "bg-brand-600 dark:bg-brand-400")} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- tables ----------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      <tr>{children}</tr>
    </thead>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-4 py-2 font-medium first:pl-5 last:pr-5", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5 align-middle first:pl-5 last:pr-5", className)}>{children}</td>;
}
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40", className)}>{children}</tr>;
}

// ---------- actions ----------

const BUTTON = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-300 dark:bg-brand-500 dark:hover:bg-brand-400 dark:disabled:bg-brand-800",
  secondary:
    "bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-800 dark:disabled:text-slate-600",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  danger: "bg-white text-rose-700 shadow-sm ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-950/40",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-300 dark:bg-emerald-600 dark:hover:bg-emerald-500",
} as const;
const SIZE = { sm: "h-8 px-2.5 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-sm" } as const;

type ButtonStyle = { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE };

export function buttonClass({ variant = "primary", size = "md" }: ButtonStyle = {}) {
  return cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed", BUTTON[variant], SIZE[size]);
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button {...props} className={cn(buttonClass({ variant, size }), className)} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link {...props} className={cn(buttonClass({ variant, size }), className)} />;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.active
              ? "border-brand-600 text-black dark:border-white dark:bg-white dark:text-black"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "tabular rounded px-1.5 text-xs",
                t.active
                  ? "bg-slate-100 text-slate-600 dark:bg-black/10 dark:text-black"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
