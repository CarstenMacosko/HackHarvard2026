import type { NextConfig } from "next";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Monorepo: keys live in the repo-root .env.local; Next only auto-loads apps/web/.env*.
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..");
loadEnvConfig(repoRoot);
loadEnvConfig(configDir);

const nextConfig: NextConfig = {
  transpilePackages: ["@vf/shared", "@vf/cv", "geist"],
  serverExternalPackages: ["@factory/droid-sdk", "@factory/cli", "@daytonaio/sdk"],
};

export default nextConfig;
