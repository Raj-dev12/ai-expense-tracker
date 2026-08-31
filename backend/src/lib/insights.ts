import { and, asc, avg, count, desc, eq, gte, ilike, isNotNull, lte, sql, sum } from "drizzle-orm";
import { db } from "../db/client.js";
import { expenses } from "../db/schema.js";
import type {
  QuestionBucket,
  QuestionFilters,
  QuestionMeasure,
  StructuredQuestion,
} from "../ai/types.js";
import { resolveCategory } from "./category-store.js";
import { addDays } from "./dates.js";
import { likePattern } from "./sql.js";

/**
 * Running a question that has already been validated.
 *
 * Everything here is SQL. The model chose which of five shapes was asked for;
 * every number below is computed by the database against the `amount_base`
 * column, so an answer about money is arithmetic that can be read and tested
 * rather than something a language model produced. That division is the whole
 * safety property of the feature.
 */

export type Answer =
  | { kind: "empty" }
  | {
      kind: "expenses";
      order: "highest" | "lowest";
      rows: Array<{ amountBase: string; merchant: string | null; description: string | null; category: string; expenseDate: string }>;
    }
  | {
      kind: "buckets";
      bucket: QuestionBucket;
      measure: QuestionMeasure;
      order: "highest" | "lowest";
      rows: Array<{ key: string; total: string; count: number; average: string }>;
    }
  | { kind: "aggregate"; measure: QuestionMeasure; total: string; count: number; average: string };

/** The window a question ends up running over, after its own filters are applied. */
export type ResolvedFilters = {
  category: string | null;
  merchant: string | null;
  from: string;
  to: string;
};

/**
 * Turn the filters a parser produced into ones the database can be trusted with.
 *
 * The category goes through `resolveCategory`, so a category that does not exist
 * is a 400 naming the ones that do — never a silently empty answer, which would
 * read as "you spent nothing on that" rather than "there is no such thing".
 *
 * The dates fall back to the window the card is showing, which is what makes
 * "highest week for groceries" mean *within the period on screen* unless the
 * question says otherwise.
 */
export async function resolveFilters(
  filters: QuestionFilters,
  window: { from: string; to: string },
): Promise<ResolvedFilters> {
  return {
    category: filters.category ? await resolveCategory(filters.category) : null,
    merchant: filters.merchant?.trim() || null,
    from: filters.from ?? window.from,
    to: filters.to ?? window.to,
  };
}

function conditions(userId: string, f: ResolvedFilters) {
  const parts = [
    eq(expenses.userId, userId),
    gte(expenses.expenseDate, f.from),
    lte(expenses.expenseDate, f.to),
  ];
  if (f.category) parts.push(eq(expenses.category, f.category));
  if (f.merchant) parts.push(ilike(expenses.merchant, likePattern(f.merchant)));
  return and(...parts);
}

/** The SQL expression each bucket groups by. */
function bucketKey(bucket: QuestionBucket) {
  switch (bucket) {
    case "day":
      return sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM-DD')`;
    case "week":
      // Monday, matching the trend chart and every other week in this app.
      return sql<string>`to_char(date_trunc('week', ${expenses.expenseDate}), 'YYYY-MM-DD')`;
    case "month":
      return sql<string>`to_char(date_trunc('month', ${expenses.expenseDate}), 'YYYY-MM-DD')`;
    case "category":
      return sql<string>`${expenses.category}`;
    case "merchant":
      return sql<string>`${expenses.merchant}`;
  }
}

function money(value: string | null): string {
  return value ?? "0.00";
}

export async function runQuestion(
  userId: string,
  question: Extract<StructuredQuestion, { kind: "aggregate" | "topExpenses" | "topBuckets" }>,
  filters: ResolvedFilters,
): Promise<Answer> {
  const where = conditions(userId, filters);

  if (question.kind === "aggregate") {
    const [row] = await db
      .select({
        total: sum(expenses.amountBase),
        count: count(),
        average: avg(expenses.amountBase),
      })
      .from(expenses)
      .where(where);

    // No rows is not a zero. "You spent nothing" and "there is nothing here to
    // measure" are different facts, and the same distinction the summary card
    // already draws when there is nothing to compare against.
    if (!row || row.count === 0) return { kind: "empty" };

    return {
      kind: "aggregate",
      measure: question.measure,
      total: money(row.total),
      count: row.count,
      average: money(row.average),
    };
  }

  if (question.kind === "topExpenses") {
    const rows = await db
      .select({
        amountBase: expenses.amountBase,
        merchant: expenses.merchant,
        description: expenses.description,
        category: expenses.category,
        expenseDate: expenses.expenseDate,
      })
      .from(expenses)
      .where(where)
      .orderBy(question.order === "highest" ? desc(expenses.amountBase) : asc(expenses.amountBase))
      .limit(question.limit);

    return rows.length === 0 ? { kind: "empty" } : { kind: "expenses", order: question.order, rows };
  }

  const key = bucketKey(question.bucket);
  const measured =
    question.measure === "count"
      ? sql<number>`count(*)`
      : question.measure === "average"
        ? sql<string>`avg(${expenses.amountBase})`
        : sql<string>`sum(${expenses.amountBase})`;

  const rows = await db
    .select({
      key,
      total: sum(expenses.amountBase),
      count: count(),
      average: avg(expenses.amountBase),
    })
    .from(expenses)
    // A "which shop" question over rows that never named one is meaningless, so
    // unnamed merchants are left out of that bucket rather than lumped together.
    .where(question.bucket === "merchant" ? and(where, isNotNull(expenses.merchant)) : where)
    .groupBy(key)
    .orderBy(question.order === "highest" ? desc(measured) : asc(measured))
    .limit(question.limit);

  if (rows.length === 0) return { kind: "empty" };

  return {
    kind: "buckets",
    bucket: question.bucket,
    measure: question.measure,
    order: question.order,
    rows: rows.map((row) => ({
      key: row.key,
      total: money(row.total),
      count: row.count,
      average: money(row.average),
    })),
  };
}

/** The last day of a bucket, for labelling a week or a month. */
export function bucketEnd(bucket: QuestionBucket, key: string): string {
  if (bucket === "week") return addDays(key, 6);
  if (bucket === "month") {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
  }
  return key;
}
