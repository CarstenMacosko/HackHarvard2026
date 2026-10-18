import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Brand, type NavSection } from "@/components/shell";
import { buttonClass, cardClass, cn } from "@/components/ui";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { navCounts } from "@/lib/queries";
import { signOutAction } from "../auth/actions";

export const dynamic = "force-dynamic";

export default async function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const db = backend();
  const researcher = await currentResearcher();
  if (!researcher) {
    // Local demo only. On Vercel, auto demo-continue loops forever (each instance has empty memory).
    const { allowInMemoryDemo } = await import("@/lib/deploy");
    if (db.mode === "demo" && allowInMemoryDemo()) {
      redirect("/auth/demo-continue?next=/researcher");
    }
    return (
      <main className="surface-mesh flex min-h-screen items-center justify-center px-6">
        <div className={cn(cardClass, "w-full max-w-md p-8 text-center")}>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Researcher sign-in required</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in or create a study team account. Studies, participants and reviews are stored in your Supabase database.
          </p>
          {db.mode !== "supabase" && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/20">
              This deploy is running in <span className="font-semibold">in-memory</span> mode — writes will not persist on Vercel.
              Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
              <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in Vercel env vars, then redeploy. Check <code className="font-mono">/api/health</code>.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/auth/sign-in?role=researcher" className={buttonClass({ size: "lg" })}>
              Sign in
            </Link>
            <Link href="/auth/sign-up?role=researcher" className={buttonClass({ variant: "secondary", size: "lg" })}>
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
        { href: "/researcher/audit", label: "Audit log", icon: "audit" },
        // { href: "/researcher/settings", label: "System status", icon: "settings" },
      ],
    },
    {
      title: "CV toolkit",
      items: [
        { href: "/researcher/models", label: "CV modules", icon: "models", exact: true },
        { href: "/researcher/generate", label: "Generate module", icon: "generate" },
      ],
    },
  ];
  return (
    <AppShell
      brand={<Brand />}
      sections={sections}
      footer={
        <div className="space-y-2.5 px-1 text-xs text-slate-500 dark:text-slate-400">
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
