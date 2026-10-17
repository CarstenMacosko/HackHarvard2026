import Link from "next/link";

export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50">
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md justify-around py-2 text-sm">
          <Link href="/participant" className="px-4 py-1.5 text-slate-600 hover:text-brand-600">Home</Link>
          <Link href="/participant/rewards" className="px-4 py-1.5 text-slate-600 hover:text-brand-600">Rewards</Link>
          <Link href="/participant/join" className="px-4 py-1.5 text-slate-600 hover:text-brand-600">Join</Link>
        </div>
      </nav>
    </div>
  );
}
