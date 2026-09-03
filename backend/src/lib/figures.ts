import { and, count, desc, eq, gte, lte, sum } from "drizzle-orm";
import { db } from "../db/client.js";
import { CONVERTIBLE_CURRENCIES, convertToBase, isConversionEnabled } from "../fx/rates.js";
import { expenses } from "../db/schema.js";
import { HttpError } from "./http-error.js";
import { toMoneyString } from "./money.js";
import { addDays, daysBetween, startOfMonth, todayIso } from "./dates.js";
import { baselineFor, type Baseline } from "./baseline.js";

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

export type PeriodFigures = Awaited<ReturnType<typeof periodFigures>>;

/**
 * The totals for a window, and for the equivalent stretch before it.
 *
 * The comparison rule is one sentence: **the same number of days, immediately
 * before the window started.** For a month-to-date window that is exactly the
 * behaviour this had when it only ever did months — 1 to 31 August compares
 * against 1 to 31 July — so nothing about the cards changed when periods
 * arrived. It generalises without the server having to learn what a "quarter"
 * is, which keeps the seven period names in the one place that has to know
 * them: the dropdown that offers them.
 *
 * Comparing a partial period against a whole one is the trap this avoids. Three
 * days into a quarter, "this quarter versus last quarter" would show spending
 * collapsing by 97% — an artefact of the calendar rather than information.
 */
export async function periodFigures(
  userId: string,
  from: string,
  to: string,
  options: { compare?: boolean } = {},
) {
  const daysElapsed = daysBetween(from, to);

  const previousEnd = addDays(from, -1);
  const previousStart = addDays(previousEnd, -(daysElapsed - 1));

  const [current, previous] = await Promise.all([
    totalBetween(userId, from, to),
    totalBetween(userId, previousStart, previousEnd),
  ]);

  const currentTotal = Number(current.total);
  const previousTotal = Number(previous.total);
  // The caller can say the window has no natural predecessor — a custom range
  // does not — in which case there is nothing to work out.
  const baseline =
    options.compare === false ? "not-comparable" : baselineFor(previous.count, previousTotal);

  return {
    from,
    to,
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
    // Whether the stretch before is enough of a sample to compare against, and
    // why not when it is not. Worked out in lib/baseline.ts so the rule exists
    // once and can be tested without a database.
    baseline: baseline as Baseline,
    // Null rather than zero or Infinity when there is nothing worth comparing
    // with: "no change", "nothing to compare" and "not enough to compare" are
    // three different things, and the page should be able to say which.
    changePercent:
      baseline === "usable"
        ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10
        : null,
  };
}

/** The default window: this calendar month so far. */
export async function monthToDate(userId: string) {
  const today = todayIso();
  return periodFigures(userId, startOfMonth(today), today);
}
