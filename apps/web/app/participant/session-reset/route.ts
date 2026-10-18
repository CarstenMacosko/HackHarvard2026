import { NextResponse } from "next/server";
import { RESEARCHER_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/deploy";
import { PARTICIPANT_COOKIE } from "@/lib/session";

/**
 * Forget which participant this browser is. Used when the remembered account no longer exists
 * (common on Vercel demo/in-memory mode across serverless instances).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL(url.searchParams.has("missing") ? "/participant/join?reset=1" : "/participant/join", url));
  const opts = { ...sessionCookieOptions(0), maxAge: 0 };
  res.cookies.set(PARTICIPANT_COOKIE, "", opts);
  res.cookies.set(RESEARCHER_COOKIE, "", opts);
  return res;
}
