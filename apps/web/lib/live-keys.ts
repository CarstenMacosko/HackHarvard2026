import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Resolve Factory / Daytona credentials and the local `droid` binary.
 *
 * Next.js only auto-loads apps/web/.env*; we also load the monorepo-root
 * .env.local here at runtime so keys work even if next.config env loading
 * did not run (or the process was started before the file existed).
 */

let loaded = false;

function loadRootEnvOnce() {
  if (loaded) return;
  loaded = true;
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(process.cwd(), "../..", ".env.local"),
    path.resolve(__dirname, "../../../.env.local"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const text = readFileSync(file, "utf8");
      for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        // Do not override vars already set by the host / Next.
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = val;
        }
      }
      break;
    } catch {
      /* ignore unreadable env files */
    }
  }
}

function env(name: string): string | null {
  loadRootEnvOnce();
  const k = process.env[name]?.trim();
  return k || null;
}

export function factoryApiKey(): string | null {
  return env("FACTORY_API_KEY");
}

export function daytonaApiKey(): string | null {
  return env("DAYTONA_API_KEY");
}

export function daytonaApiUrl(): string | undefined {
  return env("DAYTONA_API_URL") ?? undefined;
}

export function droidConfigured(): boolean {
  return Boolean(factoryApiKey());
}

export function daytonaConfigured(): boolean {
  return Boolean(daytonaApiKey());
}

/** True on Vercel / Lambda where spawning the ~252MB local `droid` CLI is not viable. */
export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Absolute path to the `droid` CLI from @factory/cli (workspace hoist or local). */
export function resolveDroidExecPath(): string {
  loadRootEnvOnce();
  const fromEnv = process.env.DROID_EXEC_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "node_modules", ".bin", "droid"),
    path.join(cwd, "..", "node_modules", ".bin", "droid"),
    path.join(cwd, "..", "..", "node_modules", ".bin", "droid"),
    path.join(cwd, "node_modules", "@factory", "cli", "bin", "droid"),
    path.join(cwd, "..", "node_modules", "@factory", "cli", "bin", "droid"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "droid";
}

/**
 * Local CLI is only usable when the binary is on disk and we are not on a
 * serverless host. Otherwise callers should use Factory managed computers.
 */
export function factoryCliRunnable(): boolean {
  if (isServerlessRuntime()) return false;
  const exec = resolveDroidExecPath();
  if (exec === "droid") return false;
  return existsSync(exec);
}

export function managedComputerName(): string {
  return env("FACTORY_COMPUTER_NAME") || "vf-streamcare-draft";
}

export function liveIntegrationStatus() {
  const cli = factoryCliRunnable();
  const droid = droidConfigured();
  return {
    droid,
    daytona: daytonaConfigured(),
    droid_exec: resolveDroidExecPath(),
    droid_transport: !droid ? ("none" as const) : cli ? ("local_cli" as const) : ("managed_computer" as const),
    managed_computer: managedComputerName(),
    serverless: isServerlessRuntime(),
    mode: droid || daytonaConfigured() ? ("live" as const) : ("demo" as const),
  };
}
