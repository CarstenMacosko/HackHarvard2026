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
    { hold_s: 2, straight_deg: 160, min_visible: 0.7, min_duration_s: 6 },
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
  if (rejected[0]?.status !== "failed" || !rejected[0]?.error?.includes("registered CVModule")) {
    console.error("FAIL: Daytona accepted a module with the wrong id", rejected[0]);
    process.exit(1);
  }
  console.log("OK: Daytona ran writing-feature track checks in real sandboxes and rejected an invalid candidate contract");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
