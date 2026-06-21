import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Next.js only auto-loads .env files from THIS app directory (apps/web). In a
// monorepo it's convenient to keep a single .env.local at the repo root, so we
// explicitly load it here (app-local first, then root as the authoritative
// source). No-op in production — those files aren't deployed and Vercel injects
// env vars directly; loadEnvFile throws on a missing file, which we swallow.
const envDir = dirname(fileURLToPath(import.meta.url));
for (const p of [resolve(envDir, ".env.local"), resolve(envDir, "../../.env.local")]) {
  try {
    process.loadEnvFile(p);
  } catch {
    /* file absent — fine */
  }
}

const nextConfig: NextConfig = {
  // Self-hostable single-image output (on-prem first-class).
  output: "standalone",
  // Allow the dev server's HMR/static resources when the app is opened via
  // 127.0.0.1 (not just localhost) — silences the dev cross-origin warning.
  allowedDevOrigins: ["127.0.0.1"],
  // Workspace packages ship raw TypeScript (main -> src/*.ts), so Next must
  // transpile them.
  transpilePackages: [
    "@claril/shared",
    "@claril/logic-inspector",
    "@claril/db",
    "@claril/ai-advisor",
  ],
};

export default nextConfig;
