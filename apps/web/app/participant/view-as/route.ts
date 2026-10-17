import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { PARTICIPANT_COOKIE } from "@/lib/session";

/** Testing helper: use the participant portal as an existing participant account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const [p] = await backend().participants({ id });
  const res = NextResponse.redirect(new URL(p ? "/participant" : "/participant/join", url));
  if (p) res.cookies.set(PARTICIPANT_COOKIE, p.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  return res;
}
