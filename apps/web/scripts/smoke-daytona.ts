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
  const candidate = {
    moduleId: "gen_daytona_smoke",
    sourceCode: `@register
class SmokeModule(CVModule):
    id = "gen_daytona_smoke"
    def prepare(self, path): pass
    def quality_checks(self, prepared, criteria): return []
    def measure(self, prepared, criteria): pass`,
  };
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
    candidate,
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
  if (!allReal || !results.every((r) => r.status === "passed")) {
    console.error("FAIL: candidate validation did not pass in real Daytona sandboxes");
    process.exit(1);
  }
  const rejected = await runExperimentsDaytona(
    grid.slice(0, 1),
    async () => {},
    { ...candidate, sourceCode: candidate.sourceCode.replace('id = "gen_daytona_smoke"', 'id = "wrong_id"') },
    1,
  );
  if (rejected[0]?.status !== "failed" || !rejected[0]?.error?.includes("candidate source invalid")) {
    console.error("FAIL: Daytona accepted a module with the wrong id", rejected[0]);
    process.exit(1);
  }
  console.log("OK: Daytona ran candidate checks in real sandboxes and rejected an invalid module");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
