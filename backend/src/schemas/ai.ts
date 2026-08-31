import { z } from "zod";
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
});

export type ExpenseSuggestionOutput = z.infer<typeof expenseSuggestionSchema>;
