"use client";

import {
  Activity,
  BarChart3,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  FileClock,
  FlaskConical,
  Gift,
  History,
  Home,
  Inbox,
  LayoutDashboard,
  Menu,
  Settings,
  Upload,
  UserPlus,
  Users,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "./ui";

const ICONS = {
  overview: LayoutDashboard,
  studies: FlaskConical,
  participants: Users,
  review: ClipboardCheck,
  submissions: Inbox,
  models: Boxes,
  train: BrainCircuit,
  generate: WandSparkles,
  builder: Workflow,
  audit: FileClock,
  settings: Settings,
  home: Home,
  upload: Upload,
  history: History,
  rewards: Gift,
  join: UserPlus,
  analytics: BarChart3,
  activity: Activity,
} as const;
export type IconName = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Full-height app frame: fixed sidebar on desktop, slide-over drawer on mobile. */
export function AppShell({
  brand,
  sections,
  footer,
  headerActions,
  children,
  mobileTabs = false,
}: {
  brand: ReactNode;
  sections: NavSection[];
  footer?: ReactNode;
  /** Shown in the sticky mobile header. */
  headerActions?: ReactNode;
  children: ReactNode;
  /** phones get a bottom tab bar instead of the drawer (participant portal) */
  mobileTabs?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && (
            <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{s.title}</div>
          )}
          <ul className="space-y-0.5">
            {s.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-slate-100 font-medium text-brand-700 before:absolute before:inset-y-1 before:-left-3 before:w-1 before:rounded-r-full before:bg-brand-500 dark:bg-slate-800 dark:text-brand-300"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-500 dark:text-brand-400" : "text-slate-400 dark:text-slate-500")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="tabular rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-700">{brand}</div>
      {nav}
      {footer && <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-700">{footer}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl dark:bg-slate-900 dark:shadow-black/40">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 lg:hidden">
          {!mobileTabs && (
            <button
              onClick={() => setOpen(!open)}
              aria-label="Open navigation"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
          {brand}
          {headerActions && <div className="ml-auto shrink-0">{headerActions}</div>}
        </header>
        <main className={cn("px-4 py-6 sm:px-6 lg:px-8 lg:py-8", mobileTabs && "pb-24 lg:pb-8")}>{children}</main>
      </div>
      {mobileTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 lg:hidden">
          <ul className="mx-auto flex max-w-lg justify-around">
            {sections
              .flatMap((s) => s.items)
              .map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] transition-colors",
                        active ? "text-brand-600 dark:text-brand-400" : "text-slate-500 dark:text-slate-400",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/streamcare-logo.png" alt="StreamCare" className={cn("h-7 w-auto dark:brightness-0 dark:invert", className)} />
  );
}

export function Brand({ suffix }: { suffix?: string }) {
  return (
    <Link href="/" className="flex min-w-0 flex-col gap-0.5">
      <BrandLogo className="h-6 w-auto max-w-full" />
      {suffix && <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{suffix}</span>}
    </Link>
  );
}
