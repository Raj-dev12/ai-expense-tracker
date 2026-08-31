// Used only by `npm run db:generate`, which compares this schema against the
// last migration and writes a new SQL file for whatever changed.
//
// The .env loading below is deliberately duplicated from src/env.ts rather than
// imported: drizzle-kit compiles this file with its own bundler, and keeping it
// dependency-free means one less thing that can break at an awkward moment.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

const envFile = resolve(process.cwd(), "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
