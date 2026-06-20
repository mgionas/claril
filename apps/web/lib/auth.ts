import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db, schema } from "@claril/db";

/**
 * Server-side Better Auth instance. Self-hosted in our own Postgres via the
 * Drizzle adapter. The organization plugin powers Claril's Org tier.
 * Reads BETTER_AUTH_SECRET / BETTER_AUTH_URL from the environment.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
});
