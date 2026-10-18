import { NextResponse } from "next/server";
import { backend } from "@/lib/backend";
import { allowInMemoryDemo, isHostedDeploy } from "@/lib/deploy";

export const dynamic = "force-dynamic";

/** Non-secret deploy health — use to confirm Vercel is on Supabase, not in-memory demo. */
export async function GET() {
  const db = backend();
  const hosted = isHostedDeploy();
  let tablesOk: boolean | null = null;
  let detail: string | null = null;
  if (db.mode === "supabase") {
    try {
      const h = await db.health();
      tablesOk = h.ok;
      detail = h.ok ? null : h.tables.filter((t) => t.error).map((t) => `${t.name}: ${t.error}`).join("; ") || h.bucket.detail;
    } catch (e) {
      tablesOk = false;
      detail = e instanceof Error ? e.message : "health check failed";
    }
  }
  const ok = db.mode === "supabase" && tablesOk !== false;
  return NextResponse.json(
    {
      ok,
      mode: db.mode,
      hosted,
      allow_in_memory_demo: allowInMemoryDemo(),
      supabase_url_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      anon_key_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      tables_ok: tablesOk,
      detail,
    },
    { status: ok ? 200 : 503 },
  );
}
