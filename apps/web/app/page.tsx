import { ArrowRight, ClipboardCheck, ShieldCheck, Sparkles, Upload } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: Upload, title: "Web check-ins", body: "Participants record photo or video check-ins in the portal. No app to install." },
  { icon: ShieldCheck, title: "On-device quality gate", body: "Blur, lighting, framing and task completion are checked before send, with specific retake instructions." },
  { icon: ClipboardCheck, title: "Clinician-verified record", body: "Every CV result is accepted, corrected or rejected by a clinician, and traces back to its source media." },
  { icon: Sparkles, title: "Generate study modules", body: "Draft a new CV analyzer with Droid and validate parameters in Daytona sandboxes before approving it for captures." },
];

export default function Home() {
  return (
    <main className="surface-mesh relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42vh] bg-[radial-gradient(ellipse_at_top,var(--glow),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="animate-fade-in flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamcare-logo.png" alt="StreamCare" className="h-9 w-auto dark:brightness-0 dark:invert" />
        </div>
        <h1 className="animate-fade-up mt-12 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 lg:text-5xl lg:leading-[1.1]">
          Longitudinal follow-up that comes to the patient.
        </h1>
        <p className="animate-fade-up animate-delay-1 mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          Participants complete short photo and video check-ins from home. Modular computer vision checks and measures each capture, and clinicians verify every result on a longitudinal timeline.
        </p>
        <div className="animate-fade-up animate-delay-2 mt-10 grid gap-4 md:grid-cols-2">
          <Link
            href="/auth/sign-in?role=researcher"
            className="group rounded-xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-brand-500"
          >
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Researcher sign in <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Create studies, invite participants, assign tests, and review captures with notes.</p>
          </Link>
          <Link
            href="/auth/sign-in"
            className="group rounded-xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-brand-500"
          >
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Participant sign in <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Sign up with an invite code, pick your assigned test, and record with live CV guidance.</p>
          </Link>
        </div>
        <div className="mt-20 grid gap-10 border-t border-slate-200/80 pt-12 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700/80">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={["animate-fade-up", i === 0 ? "animate-delay-1" : i === 1 ? "animate-delay-2" : i === 2 ? "animate-delay-3" : "animate-delay-4"].join(" ")}>
              <f.icon className="h-5 w-5 text-brand-600 dark:text-brand-400" strokeWidth={1.75} />
              <div className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{f.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
