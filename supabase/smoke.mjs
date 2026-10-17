// Checks a real Supabase project after setup.sql: every table reachable, the record_capture
// function installed, the media bucket private, and the anon key unable to read anything.
// Reads keys from the environment and never prints them. Changes nothing.
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/smoke.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_ANON_KEY to check browser access).");
  process.exit(2);
}
const TABLES = ["studies", "protocols", "participants", "scheduled_tasks", "submissions", "observations", "reviews", "reward_events", "redemptions",
  "cv_models", "workflow_drafts", "droid_jobs", "agent_conversations", "messages", "audit_log"];
const opts = { auth: { persistSession: false } };
const db = createClient(url, service, opts);
let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed++;
};

for (const t of TABLES) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  check(!error, `table ${t}`, error ? error.message : `${count} rows`);
}
// an empty payload must reach the function and be rejected by a constraint, not "function not found"
const rpc = await db.rpc("record_capture", { payload: {} });
check(Boolean(rpc.error) && !/could not find|does not exist/i.test(rpc.error.message), "function record_capture", rpc.error?.message ?? "accepted an empty capture");
const bucket = await db.storage.getBucket("media");
check(!bucket.error && bucket.data.public === false, "bucket media is private", bucket.error?.message ?? `max ${Math.round((bucket.data.file_size_limit ?? 0) / 1048576)} MB`);
if (anon) {
  const browser = createClient(url, anon, opts);
  const { data, error } = await browser.from("participants").select("id").limit(1);
  check(!error && data.length === 0, "anon key reads no participants", error?.message ?? `${data.length} rows visible`);
  const { error: rpcError } = await browser.rpc("record_capture", { payload: {} });
  check(Boolean(rpcError), "anon key cannot call record_capture");
}
console.log(failed ? `\n${failed} check(s) failed: run supabase/setup.sql on this project (docs/DATABASE.md)` : "\nSupabase project is ready");
process.exit(failed ? 1 : 0);
