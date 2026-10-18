import Link from "next/link";
import { SignUpForm } from "../auth-forms";

export const metadata = { title: "Sign up" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string; code?: string }> }) {
  const sp = await searchParams;
  const role = sp.role === "researcher" ? "researcher" : "participant";
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-6 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">VF</span>
          Visual Follow-Up
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">Create an account</h1>
        <p className="mt-2 text-sm text-slate-600">
          {role === "researcher"
            ? "Researchers can create studies, invite participants, assign tests and review captures."
            : "Participants need an invite code from their study team to join."}
        </p>
        <div className="mt-8">
          <SignUpForm defaultRole={role} defaultCode={sp.code ?? ""} />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
