import { NextResponse } from "next/server";

/** Rewards / redemptions are disabled. */
export async function POST() {
  return NextResponse.json({ error: "Rewards have been removed from this prototype." }, { status: 410 });
}
