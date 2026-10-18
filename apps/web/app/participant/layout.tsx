import { AppShell, Brand, type NavSection } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";
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

  return (
    <AppShell
      brand={<Brand suffix="Participant portal" />}
      sections={sections}
      mobileTabs={signedIn}
      headerActions={<ThemeToggle className="w-auto" />}
      footer={
        <div className="space-y-2.5 px-1 text-xs text-slate-500 dark:text-slate-400">
          <ThemeToggle />
          {signedIn && p ? (
            <div className="flex items-center justify-between gap-2">
              <span>
                Signed in as <span className="font-medium text-slate-700 dark:text-slate-200">{p.display_name}</span>
              </span>
              <form action={signOutAction}>
                <button type="submit" className="hover:text-slate-900 dark:hover:text-slate-100">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
