import { sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { APP_TIME_ZONE, todayIso } from "../lib/dates.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/health", async (_request, reply) => {
    try {
      // A trivial query is the only honest way to say the database is reachable.
      await db.execute(sql`select 1`);
    } catch {
      return reply.status(503).send({ status: "unhealthy", database: "unreachable" });
    }

    return {
      status: "ok",
      database: "reachable",
      today: todayIso(),
      timeZone: APP_TIME_ZONE,
    };
  });
};
