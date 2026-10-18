import { NextResponse } from "next/server";
import { continueAsDemoResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import { allowInMemoryDemo } from "@/lib/deploy";

export const dynamic = "force-dynamic";

/** One-click entry for local demo & `npm run dev:refresh` only — never on Vercel. */
export async function GET(req: Request) {
  if (!allowInMemoryDemo() || backend().mode !== "demo") {
    return NextResponse.redirect(new URL("/auth/sign-in?role=researcher", req.url));
  }
  try {
    await continueAsDemoResearcher();
  } catch {
    return NextResponse.redirect(new URL("/auth/sign-in?role=researcher", req.url));
  }
  const next = new URL(req.url).searchParams.get("next") || "/researcher";
  const dest = next.startsWith("/") ? next : "/researcher";
  return NextResponse.redirect(new URL(dest, req.url));
}
