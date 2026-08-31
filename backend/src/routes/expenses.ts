import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { expenses, type ExpenseRow } from "../db/schema.js";
import { resolveCategory } from "../lib/category-store.js";
import { storedAmountFor } from "../lib/figures.js";
import { HttpError } from "../lib/http-error.js";
import { toMoneyString } from "../lib/money.js";
import { getDemoUser } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import {
  createExpenseSchema,
  expenseIdParamSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "../schemas/expense.js";

/**
 * A ceiling on how much a public demo can be filled with junk. It is not
 * security — there is no login to enforce anything against — it just stops the
 * database growing without limit if the address is found by a bored stranger.
 */
const MAX_EXPENSES = 5_000;

/**
 * Amounts leave as strings, exactly as PostgreSQL stores them. Turning
 * "1234.56" into a JavaScript number here would reintroduce the floating point
 * imprecision the decimal column exists to avoid, so the caller decides when to
 * do that for display.
 */
function serializeExpense(row: ExpenseRow) {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    amountBase: row.amountBase,
    merchant: row.merchant,
    category: row.category,
    description: row.description,
    expenseDate: row.expenseDate,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
  };
}

export const expenseRoutes: FastifyPluginAsync = async (app) => {
  /**
   * The validated door into the table.
   *
   * Nothing about this route knows or cares that an AI may have suggested the
   * values. The AI's parse endpoint returns a suggestion and saves nothing; the
   * browser shows it, a person corrects and confirms it, and only then does
   * anything arrive here.
   */
  app.post("/api/expenses", async (request, reply) => {
    const input = validate(createExpenseSchema, request.body, "expense");
    const { id: userId, baseCurrency } = await getDemoUser();

    const [existing] = await db
      .select({ total: count() })
      .from(expenses)
      .where(eq(expenses.userId, userId));

    if (existing && existing.total >= MAX_EXPENSES) {
      throw new HttpError(429, "This demo has reached its expense limit");
    }

    // The category has to exist. This is the check that replaced the Zod enum:
    // a database read rather than a compiled-in list, which is what makes a
    // category added a minute ago usable now.
    const category = await resolveCategory(input.category);

    // With conversion off this simply stores what was typed, in the base
    // currency. With it on, the amount is converted at the rate from the day it
    // was spent. Either way the decision lives in one function.
    const stored = await storedAmountFor(
      input.amount,
      input.currency,
      input.expenseDate,
      baseCurrency,
    );

    const [created] = await db
      .insert(expenses)
      .values({
        userId,
        amount: toMoneyString(input.amount),
        currency: stored.currency,
        amountBase: stored.amountBase,
        merchant: input.merchant ?? null,
        category,
        description: input.description ?? null,
        expenseDate: input.expenseDate,
        source: input.source,
      })
      .returning();

    if (!created) throw new HttpError(500, "The expense could not be saved");

    return reply.status(201).send(serializeExpense(created));
  });

  app.get("/api/expenses", async (request) => {
    const query = validate(listExpensesQuerySchema, request.query, "filters");
    const { id: userId } = await getDemoUser();

    const filters = [eq(expenses.userId, userId)];
    if (query.from) filters.push(gte(expenses.expenseDate, query.from));
    if (query.to) filters.push(lte(expenses.expenseDate, query.to));
    // Resolved rather than trusted, so a filter naming a category that does not
    // exist says so instead of quietly returning nothing — which reads as "you
    // spent nothing on that" rather than "there is no such category".
    if (query.category) filters.push(eq(expenses.category, await resolveCategory(query.category)));
    if (query.search) {
      // % and _ are wildcards in a LIKE pattern, so a search for "50%" would
      // otherwise match far more than the person asked for. A backslash is
      // escaped too, because a backslash is what does the escaping. The value
      // itself is still sent as a parameter, never glued into the SQL.
      const term = query.search.replace(/[\\%_]/g, (character) => `\\${character}`);
      filters.push(
        or(ilike(expenses.merchant, `%${term}%`), ilike(expenses.description, `%${term}%`))!,
      );
    }
    if (query.minAmount !== undefined) {
      // The comparison happens in the database against the decimal column, so
      // the filter is exact rather than approximate.
      filters.push(gte(expenses.amountBase, toMoneyString(query.minAmount)));
    }

    const where = and(...filters);

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(expenses).where(where),
    ]);

    return {
      expenses: rows.map(serializeExpense),
      total: totals?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  });

  app.get("/api/expenses/:id", async (request) => {
    const { id } = validate(expenseIdParamSchema, request.params, "expense id");
    const { id: userId } = await getDemoUser();

    const [row] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .limit(1);

    if (!row) throw new HttpError(404, "No expense with that id");

    return serializeExpense(row);
  });

  /**
   * Change an expense that already exists.
   *
   * A PATCH rather than a PUT: it carries only the fields being changed, so
   * correcting a shop name is a body with one key in it. A key that is absent
   * means "leave this alone", which is a different thing from `merchant: null`,
   * meaning "empty this field". `updateExpenseSchema` enforces that distinction;
   * this route only has to respect it.
   *
   * It writes, so it goes through Zod exactly like the create route, using the
   * same field schemas. Nothing here knows or cares whether the change came from
   * the browser, an AI assistant or curl.
   */
  app.patch("/api/expenses/:id", async (request) => {
    const { id } = validate(expenseIdParamSchema, request.params, "expense id");
    const patch = validate(updateExpenseSchema, request.body, "changes");
    const { id: userId, baseCurrency } = await getDemoUser();

    const [existing] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .limit(1);

    if (!existing) throw new HttpError(404, "No expense with that id");

    const changes: Partial<typeof expenses.$inferInsert> = {};

    if (patch.amount !== undefined) changes.amount = toMoneyString(patch.amount);
    if (patch.currency !== undefined) changes.currency = patch.currency;
    if (patch.category !== undefined) changes.category = await resolveCategory(patch.category);
    if (patch.expenseDate !== undefined) changes.expenseDate = patch.expenseDate;
    // `in` rather than `!== undefined`, because null is a real value here: it
    // means the person cleared the field, and that has to be told apart from
    // never having mentioned it.
    if ("merchant" in patch) changes.merchant = patch.merchant ?? null;
    if ("description" in patch) changes.description = patch.description ?? null;

    /**
     * The base figure is derived, so it cannot be left behind.
     *
     * It depends on three things: the amount, the currency, and the day — the
     * rate used is the one from the day the money was spent. Change any of them
     * and the stored euro amount is now describing a conversion that never
     * happened, which would quietly corrupt every total and chart on the page.
     *
     * Changing only the merchant or the category touches none of that, so the
     * conversion is skipped entirely and no request goes out to the rate service
     * for an edit that cannot have moved the number.
     */
    const moneyChanged =
      patch.amount !== undefined ||
      patch.currency !== undefined ||
      patch.expenseDate !== undefined;

    if (moneyChanged) {
      // The stored amount is a decimal string; it becomes a number only to be
      // converted, and the result goes straight back to a string. Nothing is
      // stored as a float at any point.
      const amount = patch.amount ?? Number(existing.amount);
      const currency = patch.currency ?? existing.currency;
      const expenseDate = patch.expenseDate ?? existing.expenseDate;

      const stored = await storedAmountFor(amount, currency, expenseDate, baseCurrency);
      // With conversion off the currency is forced back to the base, so an edit
      // cannot smuggle in a foreign currency the rest of the app would then have
      // no way to convert.
      changes.currency = stored.currency;
      changes.amountBase = stored.amountBase;
    }

    const [updated] = await db
      .update(expenses)
      .set(changes)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning();

    if (!updated) throw new HttpError(500, "The expense could not be updated");

    return serializeExpense(updated);
  });

  app.delete("/api/expenses/:id", async (request) => {
    const { id } = validate(expenseIdParamSchema, request.params, "expense id");
    const { id: userId } = await getDemoUser();

    const [deleted] = await db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning();

    if (!deleted) throw new HttpError(404, "No expense with that id");

    return { deleted: serializeExpense(deleted) };
  });
};
