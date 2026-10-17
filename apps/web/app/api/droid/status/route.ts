import { NextResponse } from "next/server";
import { liveIntegrationStatus } from "@/lib/live-keys";

export const dynamic = "force-dynamic";

/** Whether FACTORY_API_KEY / DAYTONA_API_KEY are loaded (never returns the secrets). */
export async function GET() {
  const s = liveIntegrationStatus();
  return NextResponse.json({
    ...s,
    factory_key_present: s.droid,
    daytona_key_present: s.daytona,
  });
}
