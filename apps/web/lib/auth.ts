import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db, schema } from "@claril/db";

/**
 * Server-side Better Auth instance. Self-hosted in our own Postgres via the
 * Drizzle adapter. The organization plugin powers Claril's Org tier.
 * Reads BETTER_AUTH_SECRET / BETTER_AUTH_URL from the environment.
 *
 * `baseURL` is explicit so auth callbacks/redirects are stable: use
 * BETTER_AUTH_URL when set (prod sets it on Vercel); otherwise fall back to
 * http://localhost:3000 in development so local runs don't depend on that env
 * var being present (and don't emit the "Base URL is not set" warning). In
 * production with no env we leave it undefined so Better Auth derives it from
 * the request (correct for self-host behind any domain).
 */
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");

export const auth = betterAuth({
  ...(baseURL ? { baseURL } : {}),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
});
