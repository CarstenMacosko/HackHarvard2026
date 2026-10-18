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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                {b.href ? (
                  <Link href={b.href} className="hover:text-brand-700 dark:hover:text-brand-300">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const cardClass =
  "rounded-lg bg-white shadow-card ring-1 ring-brand-200 dark:bg-slate-900 dark:shadow-none dark:ring-brand-900";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn(cardClass, className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
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
  return <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</div>;
}

// ---------- data display ----------

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warn" | "bad" }) {
  return (
    <div className={cn(cardClass, "px-5 py-4")}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-50",
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
  blue: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-400/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-400/25",
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
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", tone === "white" ? "bg-white" : "bg-brand-500 dark:bg-brand-400")} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
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
    <thead className="border-b-2 border-brand-200 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:border-brand-900 dark:text-brand-300">
      <tr>{children}</tr>
    </thead>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 font-medium first:pl-5 last:pr-5", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle first:pl-5 last:pr-5", className)}>{children}</td>;
}
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40", className)}>{children}</tr>;
}

// ---------- forms ----------

/** Width and height are left to the caller; Tailwind resolves conflicting utilities by stylesheet order, not class order. */
export const fieldClass =
  "rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const sized = (className: string | undefined, w: string, h?: string) =>
  cn(fieldClass, !/(^|\s)w-/.test(className ?? "") && w, h && !/(^|\s)(h|min-h)-/.test(className ?? "") && h, className);

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={sized(className, "w-full", "h-9")} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={sized(className, "w-full", "h-9")} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={sized(cn("py-2 leading-relaxed", className), "w-full")} />;
}

export function Field({ label, hint, error, className, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

// ---------- actions ----------

const BUTTON = {
  primary: "bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:disabled:bg-slate-700 dark:disabled:text-slate-400",
  accent: "bg-brand-500 text-white shadow-sm hover:bg-brand-600 disabled:bg-brand-200 dark:hover:bg-brand-400 dark:disabled:bg-brand-900",
  secondary:
    "bg-white text-slate-800 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800 dark:disabled:text-slate-600",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  danger: "bg-white text-rose-700 shadow-xs ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-300 dark:ring-rose-900 dark:hover:bg-rose-950/40",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-300 dark:bg-emerald-600 dark:hover:bg-emerald-500",
} as const;
const SIZE = {
  sm: "h-8 px-2.5 text-xs [&_svg]:size-3.5",
  md: "h-9 px-3.5 text-sm [&_svg]:size-4",
  lg: "h-11 px-5 text-sm [&_svg]:size-4",
} as const;

type ButtonStyle = { variant?: keyof typeof BUTTON; size?: keyof typeof SIZE };

export function buttonClass({ variant = "primary", size = "md" }: ButtonStyle = {}) {
  return cn("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed [&_svg]:shrink-0", BUTTON[variant], SIZE[size]);
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & ButtonStyle) {
  return <button {...props} className={cn(buttonClass({ variant, size }), className)} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link {...props} className={cn(buttonClass({ variant, size }), className)} />;
}

export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.active
              ? "border-brand-500 text-slate-900 dark:border-brand-400 dark:text-white"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "tabular rounded px-1.5 text-xs",
                t.active ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
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
