import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { PoolConfig } from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * Encryption settings for the connection, decided by DB_SSL rather than by
 * looking at the hostname.
 *
 * Sniffing the URL for "supabase" would work today and be wrong the first time
 * the database moved somewhere else. One environment variable says what is
 * wanted, and the two ways of deploying set it differently.
 */
function sslOption(): PoolConfig["ssl"] {
  // undefined rather than false: node-postgres treats a missing ssl option as
  // "plain connection", which is what the local container serves.
  if (env.DB_SSL === "off") return undefined;
  return { rejectUnauthorized: env.DB_SSL === "verify" };
}

// A connection pool keeps a handful of database connections open and hands them
// out as requests need them. Opening a fresh connection per request would be
// far slower than the queries themselves.
//
// The size is configurable because the two ways of running this want opposite
// things from it. One container serving everything wants a real pool. A
// serverless function wants one connection, because there will be many copies
// of this module running at once and the database counts all of them.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  ssl: sslOption(),
  // Without this, node-postgres waits forever for a connection that is never
  // coming. A serverless function has a deadline measured in seconds, so
  // waiting forever means burning the whole budget and then being killed with
  // nothing to show for it. Ten seconds fails while there is still time to say
  // so.
  connectionTimeoutMillis: 10_000,
});

// `db` is the object every query in the app goes through.
export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}
