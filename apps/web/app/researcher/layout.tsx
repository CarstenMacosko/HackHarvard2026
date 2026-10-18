import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Brand, type NavSection } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { navCounts } from "@/lib/queries";
import { signOutAction } from "../auth/actions";

export const dynamic = "force-dynamic";

export default async function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const db = backend();
  const researcher = await currentResearcher();
  if (!researcher) {
    // Local demo / `npm run dev:refresh`: skip the sign-in wall and enter as Demo clinician.
    if (db.mode === "demo") {
      redirect("/auth/demo-continue?next=/researcher");
    }
    return (
      <main className="surface-mesh flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white/90 p-8 text-center shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Researcher sign-in required</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in or create a study team account. Studies, participants and reviews are stored in your Supabase database.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/auth/sign-in?role=researcher" className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400">
              Sign in
            </Link>
            <Link href="/auth/sign-up?role=researcher" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              Create researcher account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const counts = await navCounts();
  const sections: NavSection[] = [
    {
      items: [
        { href: "/researcher", label: "Overview", icon: "overview", exact: true },
        { href: "/researcher/studies", label: "Studies", icon: "studies" },
        { href: "/researcher/participants", label: "Participants", icon: "participants" },
      ],
    },
    {
      title: "Data quality",
      items: [
        { href: "/researcher/review", label: "Review queue", icon: "review", badge: counts.pendingReviews },
        { href: "/researcher/submissions", label: "Submissions", icon: "submissions" },
      ],
    },
    {
      title: "CV toolkit",
      items: [
        { href: "/researcher/models", label: "CV modules", icon: "models", exact: true },
        { href: "/researcher/generate", label: "Generate module", icon: "generate" },
      ],
    },
    {
      title: "Governance",
      items: [
        { href: "/researcher/audit", label: "Audit log", icon: "audit" },
        { href: "/researcher/settings", label: "System status", icon: "settings" },
      ],
    },
  ];
  return (
    <AppShell
      brand={<Brand suffix="Research workspace" />}
      sections={sections}
      footer={
        <div className="space-y-2.5 px-1 text-xs text-slate-500 dark:text-slate-400">
          <ThemeToggle />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{researcher.display_name}</span>
            <form action={signOutAction}>
              <button type="submit" className="hover:text-slate-900 dark:hover:text-slate-100">
                Sign out
              </button>
            </form>
          </div>
          <div className={db.mode === "supabase" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
            Data: {db.mode === "supabase" ? "Supabase" : "in-memory (not durable)"}
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
