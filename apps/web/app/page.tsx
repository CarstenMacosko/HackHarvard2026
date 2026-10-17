import { ArrowRight, Boxes, ClipboardCheck, MessageSquareText, ShieldCheck } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: MessageSquareText, title: "Check-ins by text or upload", body: "Participants reply to a text or drop a photo or video in the portal. No app to install." },
  { icon: ShieldCheck, title: "Quality gate on the phone", body: "Blur, lighting, framing and task completion are checked on-device, with specific retake instructions." },
  { icon: ClipboardCheck, title: "Clinician-verified record", body: "Every CV result is accepted, corrected or rejected by a clinician, and traces back to its source media." },
  { icon: Boxes, title: "Bring your own model", body: "Train a study-specific measurement from labelled captures in the browser and register it in one step." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">VF</span>
          <span className="font-semibold text-slate-900">Visual Follow-Up</span>
        </div>
        <h1 className="mt-10 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">Longitudinal follow-up that comes to the patient.</h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Participants complete short photo and video check-ins from home. Modular computer vision checks and measures each capture, and clinicians verify every result on a longitudinal timeline.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link href="/researcher" className="group rounded-xl border border-slate-200 p-6 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
            <div className="text-sm text-slate-500">For study teams</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
              Researcher portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm text-slate-600">Monitor adherence, review CV results, export analysis-ready data, and train or plug in your own models.</p>
          </Link>
          <Link href="/participant" className="group rounded-xl border border-slate-200 p-6 transition-colors hover:border-brand-500 hover:bg-brand-50/40">
            <div className="text-sm text-slate-500">For participants</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
              Participant portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm text-slate-600">Join with an invite code, upload check-ins with instant quality feedback, and earn rewards for usable data.</p>
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
        <p className="mt-16 border-t border-slate-100 pt-6 text-xs text-slate-400">
          HackHarvard 2026 prototype. All data shown is synthetic. Measurements are not clinically validated.
        </p>
      </div>
    </main>
  );
}
