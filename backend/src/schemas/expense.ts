import { z } from "zod";
import { ISO_CURRENCIES } from "../fx/rates.js";
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

/**
 * Any code ISO 4217 recognises.
 *
 * Deliberately wider than the dozen the rate table covers. With conversion off a
 * currency named in a sentence is ignored rather than refused, so rejecting it
 * here would turn "30 quid" into an error instead of 30 in the base currency.
 * Whether a currency can actually be *converted* is a separate question, asked
 * in storedAmountFor and only when conversion is on.
 */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => ISO_CURRENCIES.includes(value), {
    message: "Not a currency code ISO 4217 recognises",
  });

/**
 * A category is now a shape check, not a membership check.
 *
 * It used to be `z.enum(CATEGORY_NAMES)`, and that enum was the reason a
 * category could never be added: the list it validated against was compiled in.
 * Whether a name actually exists is a question for the `categories` table, asked
 * by `resolveCategory` in the route — a database read, which a synchronous Zod
 * schema is the wrong place for.
 *
 * The rule did not get weaker. It moved.
 */
export const categorySchema = z.string().trim().min(1, "Pick a category").max(40);

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

const merchantSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(500);

/** The body of POST /api/expenses — the one and only door into the table. */
export const createExpenseSchema = z.strictObject({
  amount: amountSchema,
  currency: currencySchema.default("EUR"),
  merchant: merchantSchema.nullish(),
  category: categorySchema,
  description: descriptionSchema.nullish(),
  expenseDate: isoDateSchema,
  source: sourceSchema.default("web"),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * The body of PATCH /api/expenses/:id.
 *
 * Every field is the *same* schema the create route uses, so an amount that
 * would be rejected on the way in is rejected on the way through as well. There
 * is one rule about editing that creating does not have, and it is worth saying
 * why the obvious shortcut is wrong: this is not `createExpenseSchema.partial()`.
 * That would carry `currency`'s `.default("EUR")` into a patch, and omitting the
 * currency — the normal thing to do when only fixing a shop name — would
 * silently rewrite a Swedish krona expense into euros. Optional here has to mean
 * "leave it alone", never "reset it".
 *
 * `source` is missing on purpose. It records where a row came from, and history
 * is not a thing an edit gets to rewrite.
 *
 * `merchant` and `description` are nullable because clearing them is a real
 * edit. Sending `null` empties the field; leaving the key out entirely does
 * nothing to it.
 */
export const updateExpenseSchema = z
  .strictObject({
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    merchant: merchantSchema.nullish(),
    category: categorySchema.optional(),
    description: descriptionSchema.nullish(),
    expenseDate: isoDateSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Send at least one field to change",
  });

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

/**
 * Filters for GET /api/expenses. Everything in a query string arrives as text,
 * so the numbers are coerced from their string form before being checked.
 */
export const listExpensesQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /**
   * Categories to filter by. Repeat the key to name several:
   * `?category=Health&category=Transport`.
   *
   * It became a list because the pie folds its smallest categories into one
   * slice, and clicking that slice has to ask for exactly the set it drew. It
   * used to ask for the literal name "Other", which is also a real category —
   * so the tooltip described five categories and the panel below it listed one,
   * and the two disagreed about the same slice.
   *
   * A repeated key rather than a comma-separated string: category names are
   * free text and a delimiter inside one would split it in half. Fastify hands
   * a repeated key over as an array and a single one as a string, so the shape
   * is normalised here rather than in the route.
   */
  category: z
    .preprocess(
      (value) => (Array.isArray(value) ? value : [value]),
      z.array(categorySchema).min(1).max(20),
    )
    .optional(),
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
