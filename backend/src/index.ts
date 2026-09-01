import { buildApp } from "./app.js";
import { closeDb } from "./db/client.js";
import { env } from "./env.js";

/**
 * The long-running way to run this backend: a process that opens a port and
 * stays up. This is what the Dockerfile starts and what `npm run dev` runs.
 *
 * The app itself is built in app.ts, which the Vercel entry point in
 * ../api/[...path].ts uses as well. Everything specific to holding a port open
 * lives here and nowhere else.
 */
const app = buildApp();

// Docker containers need 0.0.0.0 rather than localhost, or nothing outside the
// container can reach the server. listen() readies the app first, so the routes
// registered in buildApp() are all in place before the first request lands.
await app.listen({ port: env.PORT, host: "0.0.0.0" });

// Close the database pool on the way out, so a restart never leaves connections
// stranded on the server.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await closeDb();
    process.exit(0);
  });
}
