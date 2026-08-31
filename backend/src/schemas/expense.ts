import { z } from "zod";
import { CATEGORY_NAMES } from "../lib/categories.js";
import { SUPPORTED_CURRENCIES } from "../fx/rates.js";
import { addDays, todayIso } from "../lib/dates.js";

/**
 * A calendar day written as YYYY-MM-DD, which is what a `date` column stores.
 *
 * The checks run in order and stop at the first failure, so a badly formed date
 * reports one clear problem rather than three overlapping ones.
 */
export const isoDateSchema = z.string().superRefine((value, ctx) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Date must be written as YYYY-MM-DD" });
    return;
  }

  // JavaScript quietly rolls impossible dates forward: "2026-02-31" becomes the
  // 3rd of March rather than an error, and the 31st of February would reach the
  // database as a real row. Building the date and checking every part comes back
  // unchanged is what actually catches a day that never existed.
  const [year, month, day] = value.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day;

  if (!roundTrips) {
    ctx.addIssue({ code: "custom", message: "That day does not exist" });
    return;
  }

  if (value < "2000-01-01") {
    ctx.addIssue({ code: "custom", message: "Date is implausibly far in the past" });
    return;
  }

  // One day of slack, because the person entering it may be in a time zone
  // ahead of the server.
  if (value > addDays(todayIso(), 1)) {
    ctx.addIssue({ code: "custom", message: "Date is in the future" });
  }
});

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => SUPPORTED_CURRENCIES.includes(value), {
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
  });

export const categorySchema = z.enum(CATEGORY_NAMES);

/**
 * `source` records where a row came from. The caller declares it, which is fine
 * here: with no login there is nothing to impersonate, and its only job is to
 * let the demo show that the MCP server really did write this row.
 */
export const sourceSchema = z.enum(["web", "mcp", "seed"]);

const amountSchema = z
  .number()
  .refine(Number.isFinite, "Amount must be a number")
  .positive("Amount must be greater than zero")
  .max(1_000_000, "Amount is implausibly large");

/** The body of POST /api/expenses — the one and only door into the table. */
export const createExpenseSchema = z.strictObject({
  amount: amountSchema,
  currency: currencySchema.default("EUR"),
  merchant: z.string().trim().min(1).max(120).nullish(),
  category: categorySchema,
  description: z.string().trim().max(500).nullish(),
  expenseDate: isoDateSchema,
  source: sourceSchema.default("web"),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * Filters for GET /api/expenses. Everything in a query string arrives as text,
 * so the numbers are coerced from their string form before being checked.
 */
export const listExpensesQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category: categorySchema.optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  // Free text, matched against the merchant and the description. Kept here
  // rather than in the MCP server so that searching means the same thing
  // whoever asks — the browser, an AI assistant, or curl.
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const expenseIdParamSchema = z.strictObject({
  id: z.uuid("Expense id must be a UUID"),
});
