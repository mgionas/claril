import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the monorepo-root .env so migrations pick up DATABASE_URL.
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
