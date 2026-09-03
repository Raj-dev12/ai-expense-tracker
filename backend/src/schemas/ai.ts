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
 * A window, defaulting to the current calendar month. It took nothing at all
 * until the period dropdown arrived, because the dashboard had no control for
 * choosing anything else.
 *
 * Strict, so anything sent by mistake is rejected rather than ignored — the same
 * rule the analytics query strings follow.
 */
export const monthlySummaryRequestSchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

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

// ---------------------------------------------------------------------------
// Asking questions
// ---------------------------------------------------------------------------

/** The body of POST /api/ai/ask. */
export const askRequestSchema = z.strictObject({
  question: z.string().trim().min(1, "Ask something").max(300),
  // The window the card is showing. A question that names its own range
  // overrides it, which the parser expresses by filling in the filters.
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const questionFiltersSchema = z.strictObject({
  category: z.string().trim().min(1).max(40).nullish(),
  merchant: z.string().trim().min(1).max(120).nullish(),
  from: isoDateSchema.nullish(),
  to: isoDateSchema.nullish(),
});

const measureSchema = z.enum(["total", "count", "average"]);
const orderSchema = z.enum(["highest", "lowest"]);
const bucketSchema = z.enum(["day", "week", "month", "category", "merchant"]);
// Capped because the answer is one sentence. Twenty expenses read out in a row
// is not an answer, it is a list pretending to be one.
const limitSchema = z.number().int().min(1).max(10);

/**
 * The three shapes that actually produce figures.
 *
 * Pulled out of the union below so a compound question can hold a list of
 * exactly these. A compound therefore cannot contain a refusal, a signpost, or
 * another compound — not by convention, but because the shape has no way to
 * express it.
 */
const answerableQuestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("aggregate"),
    measure: measureSchema,
    filters: questionFiltersSchema.default({}),
  }),
  z.strictObject({
    kind: z.literal("topExpenses"),
    order: orderSchema,
    limit: limitSchema.default(1),
    filters: questionFiltersSchema.default({}),
  }),
  z.strictObject({
    kind: z.literal("topBuckets"),
    bucket: bucketSchema,
    measure: measureSchema,
    order: orderSchema,
    limit: limitSchema.default(1),
    filters: questionFiltersSchema.default({}),
  }),
]);

/**
 * What a parser is allowed to hand back for a question.
 *
 * A discriminated union, so an invented `kind` is refused by the shape rather
 * than falling through a switch into whichever branch happens to be last. This
 * is the check that makes the grammar a real boundary instead of a description
 * of one — everything downstream can assume it is holding one of exactly six
 * things, and that a compound holds only answerable parts.
 */
export const structuredQuestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("unsupported"),
    reason: z.string().trim().min(1).max(300),
  }),
  z.strictObject({ kind: z.literal("looksLikeExpense") }),
  ...answerableQuestionSchema.options,
  z.strictObject({
    kind: z.literal("compound"),
    // Capped for the same reason limits are capped everywhere else: a sentence
    // claiming twelve questions is a runaway, not a question.
    parts: z.array(answerableQuestionSchema).min(1).max(4),
    unanswered: z.array(z.string().trim().min(1).max(40)).max(4).default([]),
  }),
]);

export const askResultSchema = z.strictObject({
  question: structuredQuestionSchema,
  producedBy: z.enum(AI_PROVIDER_NAMES),
});

export type StructuredQuestionOutput = z.infer<typeof structuredQuestionSchema>;
