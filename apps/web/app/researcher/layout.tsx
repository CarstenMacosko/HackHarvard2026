import Link from "next/link";
import { AppShell, Brand, type NavSection } from "@/components/shell";
import { backend } from "@/lib/backend";
import { navCounts } from "@/lib/queries";
import { RESEARCHER_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const counts = await navCounts();
  const demo = backend().mode === "demo";
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
        { href: "/researcher/submissions", label: "Submissions", icon: "submissions", badge: counts.escalations },
      ],
    },
    {
      title: "CV toolkit",
      items: [
        { href: "/researcher/models", label: "Model registry", icon: "models", exact: true },
        { href: "/researcher/generate", label: "Generate module", icon: "generate" },
        { href: "/researcher/builder", label: "Workflow builder", icon: "builder" },
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
        <div className="space-y-2 px-1 text-xs">
          {demo && (
            <div className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-800 ring-1 ring-inset ring-amber-600/20">
              No database connected: uploads are not saved.{" "}
              <Link href="/researcher/settings" className="underline">
                Details
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between text-slate-500">
            <span>{RESEARCHER_NAME}</span>
            <Link href="/participant" className="hover:text-slate-900">
              Participant view →
            </Link>
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
