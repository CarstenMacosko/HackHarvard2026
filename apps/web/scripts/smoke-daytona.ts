import { buildParamGrid, runExperimentsDaytona } from "../lib/daytona-runner";
import { daytonaConfigured, liveIntegrationStatus } from "../lib/live-keys";

async function main() {
  console.log("status", liveIntegrationStatus());
  console.log("daytonaConfigured", daytonaConfigured());
  if (!daytonaConfigured()) {
    console.error("DAYTONA_API_KEY missing");
    process.exit(1);
  }
  const grid = buildParamGrid(
    { band_lo_hz: 3, band_hi_hz: 12, blur_min: 20, duration_s: 8, hand_visible: 0.8 },
    2,
  );
  const results = await runExperimentsDaytona(
    grid,
    async (e) => {
      console.log(
        "update",
        e.id,
        e.status,
        e.sandbox_id?.slice(0, 12) ?? null,
        e.metrics?.score ?? e.error?.slice(0, 80) ?? "",
      );
    },
    2,
  );
  console.log(
    "DONE",
    results.map((r) => ({
      id: r.id,
      status: r.status,
      sandbox: r.sandbox_id,
      score: r.metrics?.score,
      err: r.error,
    })),
 );
  const allReal = results.every((r) => r.sandbox_id && !r.sandbox_id.startsWith("local-"));
  if (!allReal) {
    console.error("FAIL: not all experiments used real Daytona sandbox ids");
    process.exit(1);
  }
  console.log("OK: experiments ran on Daytona");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
