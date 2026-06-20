import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";

// postgres.js connects lazily (on first query), so an empty connection string
// here does not break `next build` / static generation when DATABASE_URL is
// absent. A real query without a valid URL will throw, as expected.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export type Database = typeof db;
