import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ridgeFixture } from "./ridge-fixture";

const out = fileURLToPath(new URL("../../../training/tests/fixtures/ridge_ts.json", import.meta.url));
writeFileSync(out, JSON.stringify(ridgeFixture(), null, 1) + "\n");
console.log(`wrote ${out}`);
