import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "./client.js";

// A migration is a numbered SQL file describing one change to the database
// shape. Running them in order turns an empty database into the current one,
// which is what makes the schema reproducible on a fresh machine or server.
async function main() {
  console.log("Applying migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await closeDb();
  process.exit(1);
});
