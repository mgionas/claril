import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Single source of truth is apps/web/.env.local (the app reads it too); fall
// back to apps/web/.env and a monorepo-root .env. dotenv does not override
// already-set vars, so the first file found wins.
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
