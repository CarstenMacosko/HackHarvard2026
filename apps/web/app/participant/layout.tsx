import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Brand, type NavSection } from "@/components/shell";
import { backend } from "@/lib/backend";
import { currentParticipantId, hasParticipantCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const [p] = await backend().participants({ id: await currentParticipantId() });
  // a remembered account this server doesn't know (e.g. created on another instance with no database):
  // forget it instead of leaving the participant stuck until they clear cookies
  if (!p && (await hasParticipantCookie())) redirect("/participant/session-reset?missing=1");
  const sections: NavSection[] = [
    {
      items: [
        { href: "/participant", label: "Home", icon: "home", exact: true },
        { href: "/participant/check-in", label: "Check in", icon: "upload" },
        { href: "/participant/history", label: "History", icon: "history" },
        { href: "/participant/rewards", label: "Rewards", icon: "rewards" },
      ],
    },
  ];
  return (
    <AppShell
      brand={<Brand suffix="Participant portal" />}
      sections={sections}
      mobileTabs
      footer={
        <div className="space-y-1.5 px-1 text-xs text-slate-500">
          <div>
            Signed in as <span className="font-medium text-slate-700">{p?.display_name ?? "guest"}</span>
          </div>
          <div className="flex gap-3">
            <Link href="/participant/join" className="hover:text-slate-900">
              Join a study
            </Link>
            <a href="/participant/session-reset" className="hover:text-slate-900">
              Switch account
            </a>
            <Link href="/researcher" className="hover:text-slate-900">
              Researcher view →
            </Link>
          </div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
