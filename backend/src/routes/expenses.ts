import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { expenses, type ExpenseRow } from "../db/schema.js";
import { convertToEur } from "../fx/rates.js";
import { HttpError } from "../lib/http-error.js";
import { toMoneyString } from "../lib/money.js";
import { getDemoUserId } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import {
  createExpenseSchema,
  expenseIdParamSchema,
  listExpensesQuerySchema,
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
    amountEur: row.amountEur,
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
    const userId = await getDemoUserId();

    const [existing] = await db
      .select({ total: count() })
      .from(expenses)
      .where(eq(expenses.userId, userId));

    if (existing && existing.total >= MAX_EXPENSES) {
      throw new HttpError(429, "This demo has reached its expense limit");
    }

    const amountEur = convertToEur(input.amount, input.currency);

    const [created] = await db
      .insert(expenses)
      .values({
        userId,
        amount: toMoneyString(input.amount),
        currency: input.currency,
        amountEur: toMoneyString(amountEur),
        merchant: input.merchant ?? null,
        category: input.category,
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
    const userId = await getDemoUserId();

    const filters = [eq(expenses.userId, userId)];
    if (query.from) filters.push(gte(expenses.expenseDate, query.from));
    if (query.to) filters.push(lte(expenses.expenseDate, query.to));
    if (query.category) filters.push(eq(expenses.category, query.category));
    if (query.minAmount !== undefined) {
      // The comparison happens in the database against the decimal column, so
      // the filter is exact rather than approximate.
      filters.push(gte(expenses.amountEur, toMoneyString(query.minAmount)));
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
    const userId = await getDemoUserId();

    const [row] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .limit(1);

    if (!row) throw new HttpError(404, "No expense with that id");

    return serializeExpense(row);
  });

  app.delete("/api/expenses/:id", async (request) => {
    const { id } = validate(expenseIdParamSchema, request.params, "expense id");
    const userId = await getDemoUserId();

    const [deleted] = await db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning();

    if (!deleted) throw new HttpError(404, "No expense with that id");

    return { deleted: serializeExpense(deleted) };
  });
};
