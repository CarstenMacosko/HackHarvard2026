import { AppShell, Brand, type NavSection } from "@/components/shell";
import { signOutAction } from "@/app/auth/actions";
import { backend } from "@/lib/backend";
import { currentParticipantId, hasParticipantCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await hasParticipantCookie();
  const [p] = signedIn ? await backend().participants({ id: await currentParticipantId() }) : [undefined];

  const sections: NavSection[] = [
    {
      items: [
        { href: "/participant", label: "Home", icon: "home", exact: true },
        { href: "/participant/check-in", label: "Check in", icon: "upload" },
        { href: "/participant/history", label: "History", icon: "history" },
      ],
    },
  ];

  // Join / session-reset still use this shell; only show account footer when signed in.
  return (
    <AppShell
      brand={<Brand suffix="Participant portal" />}
      sections={sections}
      mobileTabs={signedIn}
      footer={
        signedIn && p ? (
          <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
            <span>
              Signed in as <span className="font-medium text-slate-700">{p.display_name}</span>
            </span>
            <form action={signOutAction}>
              <button type="submit" className="hover:text-slate-900">
                Sign out
              </button>
            </form>
          </div>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
