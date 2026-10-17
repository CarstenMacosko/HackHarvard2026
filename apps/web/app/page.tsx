import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium text-brand-600">HackHarvard 2026</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Visual Follow-Up</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Patients complete short photo and video check-ins by text. Computer vision checks and measures each one, and
        clinicians verify every result on a longitudinal timeline.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/researcher" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-500">
          <div className="text-sm font-medium text-slate-500">For study teams</div>
          <div className="mt-1 text-xl font-semibold group-hover:text-brand-600">Researcher portal →</div>
          <p className="mt-2 text-sm text-slate-600">Manage participants, review CV results, track adherence, draft workflows for new conditions.</p>
        </Link>
        <Link href="/participant" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-500">
          <div className="text-sm font-medium text-slate-500">For participants</div>
          <div className="mt-1 text-xl font-semibold group-hover:text-brand-600">Participant portal →</div>
          <p className="mt-2 text-sm text-slate-600">Join a study, see your next check-in, and earn rewards for every usable submission.</p>
        </Link>
      </div>
      <p className="mt-10 text-xs text-slate-400">Prototype. All data shown is synthetic. Measurements are not clinically validated.</p>
    </main>
  );
}
