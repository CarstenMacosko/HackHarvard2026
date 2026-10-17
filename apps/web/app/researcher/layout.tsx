import Link from "next/link";
import { backend } from "@/lib/backend";

const NAV = [
  { href: "/researcher", label: "Studies" },
  { href: "/researcher/review", label: "Review queue" },
  { href: "/researcher/builder", label: "Workflow builder" },
];

export default function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const demo = backend().mode === "demo";
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Visual Follow-Up <span className="font-normal text-slate-400">· Research</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          {demo && <span className="ml-auto text-xs text-amber-600">Demo data (Supabase not configured)</span>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
