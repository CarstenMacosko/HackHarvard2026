#!/usr/bin/env node
/**
 * Start `npm run dev` with an empty in-memory demo slate for this process only.
 *
 * Does NOT delete `.data/demo-state.json` or `gen_*.py`. The next plain
 * `npm run dev` reloads the previously saved data.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("[dev:refresh] starting with empty session data (saved .data/demo-state.json is left alone)");
console.log("[dev:refresh] stop this process and run `npm run dev` to reload your previous saved data");

const child = spawn("npm", ["run", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, VF_DEMO_FRESH: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
