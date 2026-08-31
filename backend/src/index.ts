import Fastify from "fastify";
import { closeDb } from "./db/client.js";
import { env } from "./env.js";
import { HttpError } from "./lib/http-error.js";
import { aiRoutes } from "./routes/ai.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { expenseRoutes } from "./routes/expenses.js";
import { healthRoutes } from "./routes/health.js";
import { settingsRoutes } from "./routes/settings.js";

const app = Fastify({ logger: true });

// One place that turns a thrown error into a response. Routes stay readable
// because none of them repeat this.
app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) {
    request.log.warn({ status: error.statusCode, reason: error.message }, "request rejected");
    return reply.status(error.statusCode).send({
      error: error.message,
      details: error.details,
    });
  }

  // Fastify raises these itself for things like malformed JSON. They arrive
  // typed as unknown, so the status is read defensively before being trusted.
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status === "number" && status < 500) {
    const message = error instanceof Error ? error.message : "Bad request";
    return reply.status(status).send({ error: message });
  }

  request.log.error({ err: error }, "unhandled error");
  return reply.status(500).send({ error: "Something went wrong" });
});

app.setNotFoundHandler((request, reply) =>
  reply.status(404).send({ error: `No route for ${request.method} ${request.url}` }),
);

await app.register(healthRoutes);
await app.register(expenseRoutes);
await app.register(aiRoutes);
await app.register(analyticsRoutes);
await app.register(settingsRoutes);

// Docker containers need 0.0.0.0 rather than localhost, or nothing outside the
// container can reach the server.
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
