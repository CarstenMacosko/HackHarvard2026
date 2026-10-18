/**
 * Smoke-test Factory managed-computer draft path (HTTP Sessions API).
 * Usage: npx tsx scripts/smoke-managed-computer.ts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import Module from "node:module";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(path.resolve(__dirname, "../../../.env.local"));

type LoadFn = (request: string, parent: NodeModule | undefined, isMain: boolean) => unknown;
const mod = Module as unknown as { _load: LoadFn };
const orig = mod._load.bind(Module);
mod._load = (request, parent, isMain) => {
  if (request === "server-only") return {};
  return orig(request, parent, isMain);
};

async function main() {
  const { runPromptOnManagedComputer } = await import("../lib/droid-managed-computer");
  const apiKey = process.env.FACTORY_API_KEY;
  if (!apiKey) throw new Error("FACTORY_API_KEY unset");
  const text = await runPromptOnManagedComputer("Reply with exactly the word PONG and nothing else.", apiKey);
  console.log("RESULT:", JSON.stringify(text));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
