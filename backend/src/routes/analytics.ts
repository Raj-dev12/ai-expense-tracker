import { and, count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { expenses } from "../db/schema.js";
import {
  addDays,
  dayOfMonth,
  daysInMonth,
  startOfMonth,
  startOfPreviousMonth,
  startOfWeek,
  todayIso,
  weekStartsBetween,
} from "../lib/dates.js";
import { getDemoUserId } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import { rangeQuerySchema, summaryQuerySchema } from "../schemas/analytics.js";

/** How far back the trend and the pie look when no window is given. */
const DEFAULT_MONTHS = 3;

/**
 * Totals come back as strings, the same as individual amounts do.
 *
 * PostgreSQL adds `numeric` columns exactly, and turning the result into a
 * JavaScript number here would throw that away at the last step — after going to
 * the trouble of a decimal column precisely to avoid it. The browser converts
 * for display and for the charts.
 */
function money(value: string | null): string {
  return value ?? "0.00";
}

async function totalBetween(userId: string, from: string, to: string) {
  const [row] = await db
    .select({ total: sum(expenses.amountEur), count: count() })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, from),
        lte(expenses.expenseDate, to),
      ),
    );

  return { total: money(row?.total ?? null), count: row?.count ?? 0 };
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Month to date, and the same stretch of the month before.
   *
   * The comparison deliberately uses the same *number of days* rather than the
   * whole previous month. Comparing the first three days of August against the
   * whole of July would show spending collapsing by 90% every month, which is
   * not information, it is an artefact of the calendar.
   */
  app.get("/api/analytics/summary", async (request) => {
    validate(summaryQuerySchema, request.query, "parameters");
    const userId = await getDemoUserId();

    const today = todayIso();
    const from = startOfMonth(today);
    const daysElapsed = dayOfMonth(today);

    const previousStart = startOfPreviousMonth(today);
    // A shorter previous month is clamped, so 31 March compares against all of
    // February rather than running off the end of it.
    const previousDays = Math.min(daysElapsed, daysInMonth(previousStart));
    const previousEnd = addDays(previousStart, previousDays - 1);

    const [current, previous] = await Promise.all([
      totalBetween(userId, from, today),
      totalBetween(userId, previousStart, previousEnd),
    ]);

    const currentTotal = Number(current.total);
    const previousTotal = Number(previous.total);

    return {
      from,
      to: today,
      daysElapsed,
      totalEur: current.total,
      count: current.count,
      dailyAverageEur: (currentTotal / daysElapsed).toFixed(2),
      previous: {
        from: previousStart,
        to: previousEnd,
        totalEur: previous.total,
        count: previous.count,
      },
      // Null rather than zero or Infinity when there is nothing to compare with:
      // "no change" and "nothing to compare" are different things, and the page
      // should be able to say so.
      changePercent:
        previousTotal > 0
          ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10
          : null,
    };
  });

  /** What the pie chart draws: one slice per category that has anything in it. */
  app.get("/api/analytics/categories", async (request) => {
    const query = validate(rangeQuerySchema, request.query, "filters");
    const userId = await getDemoUserId();

    const today = todayIso();
    const to = query.to ?? today;
    const from = query.from ?? startOfMonth(today);

    const rows = await db
      .select({
        category: expenses.category,
        total: sum(expenses.amountEur),
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
      .groupBy(expenses.category)
      .orderBy(desc(sum(expenses.amountEur)));

    return {
      from,
      to,
      // Categories with no spending are left out rather than sent as zeroes: a
      // pie chart cannot draw a slice of nothing, and a legend full of empty
      // categories is noise.
      categories: rows.map((row) => ({
        category: row.category,
        totalEur: money(row.total),
        count: row.count,
      })),
    };
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
    const userId = await getDemoUserId();

    const today = todayIso();
    const to = query.to ?? today;
    const from = query.from ?? addDays(startOfWeek(today), -7 * (DEFAULT_MONTHS * 4 + 1));

    const rows = await db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${expenses.expenseDate}), 'YYYY-MM-DD')`,
        total: sum(expenses.amountEur),
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
        totalEur: money(row?.total ?? null),
        count: row?.count ?? 0,
      };
    });

    return { from, to, bucket: "week", points };
  });
};
