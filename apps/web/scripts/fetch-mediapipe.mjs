// Self-host MediaPipe's WASM runtime and hand-landmarker model under public/mediapipe so the
// on-device CV works without third-party CDNs. Runs before `next dev` / `next build`.
// If the model download fails, the browser falls back to Google's hosted copy at runtime.
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "mediapipe");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const pkgDir = dirname(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision"));
mkdirSync(join(out, "wasm"), { recursive: true });
for (const f of readdirSync(join(pkgDir, "wasm"))) copyFileSync(join(pkgDir, "wasm", f), join(out, "wasm", f));

const model = join(out, "hand_landmarker.task");
if (existsSync(model) && statSync(model).size > 1_000_000) {
  console.log("mediapipe: wasm copied, model present");
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model + ".part", Buffer.from(await res.arrayBuffer()));
    renameSync(model + ".part", model);
    console.log("mediapipe: wasm copied, model downloaded");
  } catch (e) {
    console.warn(`mediapipe: could not download the hand model (${e.message}); browsers will load it from Google at runtime`);
  }
}
