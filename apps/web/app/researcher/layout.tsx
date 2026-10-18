import Link from "next/link";
import { AppShell, Brand, type NavSection } from "@/components/shell";
import { currentResearcher } from "@/lib/auth";
import { navCounts } from "@/lib/queries";
import { signOutAction, demoResearcherAction } from "../auth/actions";

export const dynamic = "force-dynamic";

export default async function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const researcher = await currentResearcher();
  if (!researcher) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Researcher sign-in required</h1>
          <p className="mt-2 text-sm text-slate-600">Create a study team account, or continue with the local demo clinician for a quick walkthrough.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/auth/sign-in?role=researcher" className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              Sign in
            </Link>
            <Link href="/auth/sign-up?role=researcher" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Create researcher account
            </Link>
            <form action={demoResearcherAction}>
              <button type="submit" className="w-full text-sm text-brand-700 hover:underline">
                Continue as demo clinician
              </button>
            </form>
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
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
          <span className="truncate font-medium text-slate-700">{researcher.display_name}</span>
          <form action={signOutAction}>
            <button type="submit" className="hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
