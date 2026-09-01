import Fastify, { type FastifyInstance } from "fastify";
import { HttpError } from "./lib/http-error.js";
import { aiRoutes } from "./routes/ai.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { categoryRoutes } from "./routes/categories.js";
import { expenseRoutes } from "./routes/expenses.js";
import { healthRoutes } from "./routes/health.js";
import { settingsRoutes } from "./routes/settings.js";

/**
 * Builds the app without starting it.
 *
 * This used to be the top half of index.ts. It was split out because there are
 * now two ways to run this backend and they disagree about exactly one thing:
 * who opens the port.
 *
 *   Docker    index.ts calls listen(), and the process stays up for months.
 *   Vercel    api/[...path].ts never listens. There is no port and no long-
 *             running process — the platform hands Fastify one request at a
 *             time and Fastify answers it.
 *
 * Everything else — the error handler, the six route plugins, every schema and
 * every query behind them — is identical in both. Keeping the difference down
 * to the last three lines of index.ts is the point of this file.
 */
export function buildApp(): FastifyInstance {
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

  // register() is awaited in index.ts's original form, but Fastify queues
  // plugins and applies them when ready() runs, so registering without awaiting
  // is the documented way to build an app synchronously. Both callers await
  // ready() before a request is allowed anywhere near it.
  app.register(healthRoutes);
  app.register(expenseRoutes);
  app.register(aiRoutes);
  app.register(analyticsRoutes);
  app.register(settingsRoutes);
  app.register(categoryRoutes);

  return app;
}
