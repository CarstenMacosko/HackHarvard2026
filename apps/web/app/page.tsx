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
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamcare-logo.png" alt="StreamCare" className="h-8 w-auto" />
        </div>
        <h1 className="mt-10 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">Longitudinal follow-up that comes to the patient.</h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Participants complete short photo and video check-ins from home. Modular computer vision checks and measures each capture, and clinicians verify every result on a longitudinal timeline.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link href="/auth/sign-in?role=researcher" className="group rounded-xl border border-slate-200 p-6 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
              Researcher sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm text-slate-600">Create studies, invite participants, assign tests, and review captures with notes.</p>
          </Link>
          <Link href="/auth/sign-in" className="group rounded-xl border border-slate-200 p-6 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
              Participant sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm text-slate-600">Sign up with an invite code, pick your assigned test, and record with live CV guidance.</p>
          </Link>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <f.icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
              <div className="mt-3 text-sm font-semibold text-slate-900">{f.title}</div>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
