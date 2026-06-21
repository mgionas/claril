import type { NextConfig } from "next";

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
