import { z } from "zod";
import { AI_PROVIDER_NAMES } from "../ai/types.js";
import { categorySchema, currencySchema, isoDateSchema } from "./expense.js";

/** The body of POST /api/ai/parse-expense. */
export const parseExpenseRequestSchema = z.strictObject({
  sentence: z.string().trim().min(1, "Say what you spent").max(500),
  // Optional, so a test can pin what "yesterday" means. Left out in normal use,
  // where the server decides what today is.
  today: isoDateSchema.optional(),
});

/**
 * What a parser is allowed to hand back.
 *
 * This is the important one. An AI's reply is an input from somewhere we do not
 * control, exactly like an HTTP request body, and it gets checked just as
 * hard — a model can return malformed JSON, invent a category that does not
 * exist, or produce a negative amount. Validating here is what makes "the AI
 * never writes to the database" an enforceable rule rather than a hope.
 */
export const expenseSuggestionSchema = z.strictObject({
  // Nullable because a parser that cannot find a number should say so rather
  // than invent one. The person fills it in at the confirm step.
  amount: z.number().positive().max(1_000_000).nullable(),
  currency: currencySchema,
  merchant: z.string().trim().min(1).max(120).nullable(),
  category: categorySchema,
  description: z.string().trim().max(500).nullable(),
  expenseDate: isoDateSchema,
});

export const parseResultSchema = z.strictObject({
  suggestion: expenseSuggestionSchema,
  confidence: z.number().min(0).max(1),
  producedBy: z.enum(AI_PROVIDER_NAMES),
});

export type ExpenseSuggestionOutput = z.infer<typeof expenseSuggestionSchema>;

/**
 * The body of POST /api/ai/monthly-summary.
 *
 * There is nothing in it. The endpoint summarises the current month, which the
 * server already knows, and taking a month from the caller would be a filter the
 * dashboard has no control for. An empty object rather than no schema at all,
 * because `strictObject` then rejects anything sent by mistake instead of
 * ignoring it — the same rule the analytics query strings follow.
 */
export const monthlySummaryRequestSchema = z.strictObject({});

/**
 * What a parser is allowed to hand back as a summary.
 *
 * Prose from a model is still an input from outside, so it is checked like any
 * other. The length cap matters more than it looks: the prompt asks for two or
 * three sentences, and a model that ignores that and returns three pages should
 * be a clean 502 rather than something the page tries to lay out.
 */
export const monthlySummaryResultSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  producedBy: z.enum(AI_PROVIDER_NAMES),
});
