import { ArrowRight, ClipboardCheck, ShieldCheck, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { buttonClass, cardClass, cn } from "@/components/ui";

const FEATURES = [
  { icon: Upload, title: "Web check-ins", body: "Participants record photo or video check-ins in the portal. No app to install." },
  { icon: ShieldCheck, title: "On-device quality gate", body: "Blur, lighting, framing and task completion are checked before send, with specific retake instructions." },
  { icon: ClipboardCheck, title: "Clinician-verified record", body: "Every CV result is accepted, corrected or rejected by a clinician, and traces back to its source media." },
  { icon: Sparkles, title: "Generate study modules", body: "Draft a new CV analyzer with Droid and validate parameters in Daytona sandboxes before approving it for captures." },
];

const ROLES = [
  {
    href: "/auth/sign-in?role=researcher",
    eyebrow: "For research teams",
    title: "Researcher sign in",
    body: "Create studies, invite participants, assign tests, and review captures with notes.",
  },
  {
    href: "/auth/sign-in",
    eyebrow: "For study participants",
    title: "Participant sign in",
    body: "Sign up with an invite code, pick your assigned test, and record with live CV guidance.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="border-t-[3px] border-brand-500 bg-white dark:bg-slate-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamcare-logo.png" alt="StreamCare" className="h-7 w-auto dark:brightness-0 dark:invert" />
          <nav className="flex items-center gap-2">
            <Link href="/auth/sign-in" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/auth/sign-up?role=researcher" className={buttonClass({ variant: "primary", size: "sm" })}>
              Start a study
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
            <p className="animate-fade-in text-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Remote longitudinal follow-up</p>
            <h1 className="animate-fade-up mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 lg:text-5xl lg:leading-[1.08]">
              Longitudinal follow-up that comes to the patient.
            </h1>
            <p className="animate-fade-up animate-delay-1 mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              Participants complete short photo and video check-ins from home. Modular computer vision checks and measures each capture, and clinicians verify every result on a longitudinal timeline.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="animate-fade-up animate-delay-2 grid gap-5 md:grid-cols-2">
            {ROLES.map((r) => (
              <Link key={r.href} href={r.href} className={cn(cardClass, "group block p-6 transition-shadow duration-200 hover:shadow-card-hover")}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{r.eyebrow}</p>
                <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">
                  {r.title}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{r.body}</p>
              </Link>
            ))}
          </div>

          <h2 className="mt-16 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">How it works</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className={cn(cardClass, "p-5")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-900/40">
                  <f.icon className="h-[18px] w-[18px] text-brand-600 dark:text-brand-300" />
                </div>
                <div className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{f.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500 dark:text-slate-400">StreamCare · Clinician-verified visual follow-up for longitudinal studies</div>
      </footer>
    </div>
  );
}
