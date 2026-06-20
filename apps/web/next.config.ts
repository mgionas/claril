import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hostable single-image output (on-prem first-class).
  output: "standalone",
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
