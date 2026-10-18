import Link from "next/link";
import { SignInForm } from "../auth-forms";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; role?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-6 py-16">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="inline-flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/streamcare-logo.png" alt="StreamCare" className="h-7 w-auto" />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <div className="mt-8">
          <SignInForm />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          New here?{" "}
          <Link href={`/auth/sign-up${sp.role === "researcher" ? "?role=researcher" : ""}`} className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
