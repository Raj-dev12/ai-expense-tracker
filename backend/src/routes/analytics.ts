import { and, count, eq, gte, lte, sql, sum } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { expenses } from "../db/schema.js";
import { addDays, startOfMonth, startOfWeek, todayIso, weekStartsBetween } from "../lib/dates.js";
// The queries behind these live in one module because the AI monthly summary
// needs the same numbers. See lib/figures.ts.
import { categoryTotalsBetween, money, monthToDate } from "../lib/figures.js";
import { getDemoUser } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import { rangeQuerySchema, summaryQuerySchema } from "../schemas/analytics.js";

/** How far back the trend and the pie look when no window is given. */
const DEFAULT_MONTHS = 3;

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  /** Month to date, and the same stretch of the month before. */
  app.get("/api/analytics/summary", async (request) => {
    validate(summaryQuerySchema, request.query, "parameters");
    const { id: userId } = await getDemoUser();

    return monthToDate(userId);
  });

  /** What the pie chart draws: one slice per category that has anything in it. */
  app.get("/api/analytics/categories", async (request) => {
    const query = validate(rangeQuerySchema, request.query, "filters");
    const { id: userId } = await getDemoUser();

    const today = todayIso();
    const to = query.to ?? today;
    const from = query.from ?? startOfMonth(today);

    return { from, to, categories: await categoryTotalsBetween(userId, from, to) };
  });

  /**
   * What the trend line draws: weekly totals across the last three months.
   *
   * Weekly rather than monthly, because three months is three points and three
   * points is not a line. Weeks start on Monday, and `date_trunc('week', ...)`
   * agrees, so the buckets the database groups by line up with the ones built
   * here.
   */
  app.get("/api/analytics/trend", async (request) => {
    const query = validate(rangeQuerySchema, request.query, "filters");
    const { id: userId } = await getDemoUser();

    const today = todayIso();
    const to = query.to ?? today;
    const from = query.from ?? addDays(startOfWeek(today), -7 * (DEFAULT_MONTHS * 4 + 1));

    const rows = await db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${expenses.expenseDate}), 'YYYY-MM-DD')`,
        total: sum(expenses.amountBase),
        count: count(),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.expenseDate, from),
          lte(expenses.expenseDate, to),
        ),
      )
      .groupBy(sql`date_trunc('week', ${expenses.expenseDate})`)
      .orderBy(sql`date_trunc('week', ${expenses.expenseDate})`);

    const byWeek = new Map(rows.map((row) => [row.weekStart, row]));

    // Weeks with no spending are filled in as zero rather than skipped. Leaving
    // them out would draw a line straight across the gap, which reads as steady
    // spending during a week when there was none.
    const points = weekStartsBetween(from, to).map((weekStart) => {
      const row = byWeek.get(weekStart);
      return {
        weekStart,
        totalBase: money(row?.total ?? null),
        count: row?.count ?? 0,
      };
    });

    return { from, to, bucket: "week", points };
  });
};
