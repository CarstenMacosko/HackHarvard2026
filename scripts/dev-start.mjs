#!/usr/bin/env node
/**
 * Regular local start: clear any one-shot fresh marker, then run Next.
 * Saves/loads `.data/demo-state.json` across restarts.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marker = path.join(root, ".data", "VF_DEMO_FRESH");

try {
  mkdirSync(path.dirname(marker), { recursive: true });
  if (existsSync(marker)) {
    unlinkSync(marker);
    console.log("[dev] cleared fresh-session marker — loading saved demo data if present");
  }
} catch {
  /* ignore */
}

const child = spawn("npm", ["run", "dev", "-w", "apps/web"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, VF_DEMO_FRESH: "" },
});
child.on("exit", (code) => process.exit(code ?? 0));
