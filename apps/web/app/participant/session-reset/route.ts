import { NextResponse } from "next/server";
import { PARTICIPANT_COOKIE } from "@/lib/session";

/**
 * Forget which participant this browser is. Used when the remembered account no longer exists on
 * this server (e.g. it was created on another server instance without a database), and as
 * "Switch account" in the portal, so nobody has to clear cookies by hand.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL(url.searchParams.has("missing") ? "/participant/join?reset=1" : "/participant/join", url));
  res.cookies.delete(PARTICIPANT_COOKIE);
  return res;
}
