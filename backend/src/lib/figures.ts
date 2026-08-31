import { and, count, desc, eq, gte, lte, sum } from "drizzle-orm";
import { db } from "../db/client.js";
import { CONVERTIBLE_CURRENCIES, convertToBase, isConversionEnabled } from "../fx/rates.js";
import { expenses } from "../db/schema.js";
import { HttpError } from "./http-error.js";
import { toMoneyString } from "./money.js";
import {
  addDays,
  dayOfMonth,
  daysInMonth,
  startOfMonth,
  startOfPreviousMonth,
  todayIso,
} from "./dates.js";

/**
 * The month's numbers, worked out in exactly one place.
 *
 * Both the dashboard cards and the AI monthly summary need the same figures.
 * Computing them twice would be two definitions of "what you spent this month",
 * and the day they disagreed the interface would contradict itself on screen —
 * a card saying 7% less while the sentence underneath it said 4% more. So the
 * queries live here and both callers use them.
 */

/**
 * Totals come back as strings, the same as individual amounts do.
 *
 * PostgreSQL adds `numeric` columns exactly, and turning the result into a
 * JavaScript number here would throw that away at the last step — after going to
 * the trouble of a decimal column precisely to avoid it. The browser converts
 * for display and for the charts.
 */
export function money(value: string | null): string {
  return value ?? "0.00";
}

export type StoredAmount = {
  /** The currency actually written to the row. */
  currency: string;
  /** The figure written to `amount_base`. */
  amountBase: string;
};

/**
 * What a row should actually store, in either mode.
 *
 * The single place that knows the difference, used by create and by patch.
 *
 * **Conversion off (the default).** There is one currency and it is the base. A
 * currency named in a sentence is ignored rather than refused, so "30 quid" with
 * a euro base records 30 euros — the number a person typed is the number that is
 * stored. Nothing is derived, which is what makes changing the base afterwards a
 * change of symbol and nothing more.
 *
 * **Conversion on.** The amount is converted at the rate from the day it was
 * spent, never today's, and both figures are kept. The currency has to be one
 * the rate table covers, because an amount that cannot be converted has no base
 * figure to store.
 */
export async function storedAmountFor(
  amount: number | string,
  requestedCurrency: string,
  expenseDate: string,
  baseCurrency: string,
): Promise<StoredAmount> {
  const value = Number(amount);

  if (!isConversionEnabled()) {
    return { currency: baseCurrency, amountBase: toMoneyString(value) };
  }

  if (!CONVERTIBLE_CURRENCIES.includes(requestedCurrency)) {
    throw new HttpError(400, `Cannot convert ${requestedCurrency}`, {
      convertible: CONVERTIBLE_CURRENCIES,
    });
  }

  const conversion = await convertToBase(value, requestedCurrency, expenseDate, baseCurrency);
  return { currency: requestedCurrency, amountBase: toMoneyString(conversion.amountBase) };
}

export async function totalBetween(userId: string, from: string, to: string) {
  const [row] = await db
    .select({ total: sum(expenses.amountBase), count: count() })
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

export async function categoryTotalsBetween(userId: string, from: string, to: string) {
  const rows = await db
    .select({
      category: expenses.category,
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
    .groupBy(expenses.category)
    .orderBy(desc(sum(expenses.amountBase)));

  // Categories with no spending are left out rather than sent as zeroes: a pie
  // chart cannot draw a slice of nothing, and a legend full of empty categories
  // is noise.
  return rows.map((row) => ({
    category: row.category,
    totalBase: money(row.total),
    count: row.count,
  }));
}

export type MonthToDate = Awaited<ReturnType<typeof monthToDate>>;

/**
 * Month to date, and the same stretch of the month before.
 *
 * The comparison deliberately uses the same *number of days* rather than the
 * whole previous month. Comparing the first three days of August against the
 * whole of July would show spending collapsing by 90% every month, which is not
 * information, it is an artefact of the calendar.
 */
export async function monthToDate(userId: string) {
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
    totalBase: current.total,
    count: current.count,
    dailyAverageBase: (currentTotal / daysElapsed).toFixed(2),
    previous: {
      from: previousStart,
      to: previousEnd,
      totalBase: previous.total,
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
}
