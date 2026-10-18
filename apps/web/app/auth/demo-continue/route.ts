import { NextResponse } from "next/server";
import { continueAsDemoResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/** One-click / auto entry for local demo & `npm run dev:refresh` sessions. */
export async function GET(req: Request) {
  if (backend().mode !== "demo") {
    return NextResponse.redirect(new URL("/auth/sign-in?role=researcher", req.url));
  }
  await continueAsDemoResearcher();
  const next = new URL(req.url).searchParams.get("next") || "/researcher";
  const dest = next.startsWith("/") ? next : "/researcher";
  return NextResponse.redirect(new URL(dest, req.url));
}
