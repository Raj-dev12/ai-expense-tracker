import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

// A connection pool keeps a handful of database connections open and hands them
// out as requests need them. Opening a fresh connection per request would be
// far slower than the queries themselves.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// `db` is the object every query in the app goes through.
export const db = drizzle(pool, { schema });

export async function closeDb(): Promise<void> {
  await pool.end();
}
