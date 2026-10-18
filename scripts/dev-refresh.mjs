#!/usr/bin/env node
/**
 * Start Next with an empty product slate for this process only.
 * Writes `.data/VF_DEMO_FRESH` so the app ignores saved demo/Supabase rows.
 * Does not delete `.data/demo-state.json` — plain `npm run dev` restores it.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, ".data", "VF_DEMO_FRESH");

mkdirSync(path.dirname(marker), { recursive: true });
writeFileSync(marker, `${new Date().toISOString()}\n`, "utf8");

console.log("[dev:refresh] empty session (Created Modules, studies, participants start blank)");
console.log("[dev:refresh] saved data in .data/demo-state.json is untouched — use `npm run dev` later to reload it");

const child = spawn("npm", ["run", "dev", "-w", "apps/web"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, VF_DEMO_FRESH: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
