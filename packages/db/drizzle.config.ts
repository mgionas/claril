import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the same env the app uses, in priority order. dotenv does not override
// already-set vars, so the first file found wins — and a pre-set DATABASE_URL
// (e.g. for a one-off prod migration) always takes precedence. Order: a
// monorepo-root .env.local, then apps/web/.env.local, then their .env fallbacks.
config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });
config({ path: "../../apps/web/.env" });
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
